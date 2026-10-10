import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
import server
from catalog_tools import price_number, weight_kg, structured_offers, material_matches


class ParserTests(unittest.TestCase):
    def test_decimal_prices(self):
        for value, expected in [('19.99',19.99),('19,99',19.99),('1.299,95',1299.95),('1,299.95',1299.95)]:
            self.assertEqual(price_number(value),expected)
        for value in ('NaN','Infinity','',None,-10):
            self.assertIsNone(price_number(value))

    def test_multipack_and_net_weight(self):
        self.assertEqual(weight_kg('PLA 2 x 1 kg'),2)
        self.assertEqual(weight_kg('pack of 4 250g'),1)
        self.assertEqual(weight_kg('750 g'),.75)
        self.assertEqual(weight_kg('1.000 g'),1)
        self.assertIsNone(weight_kg('PLA shipping box'))

    def test_specific_material(self):
        self.assertFalse(material_matches('PLA Matte','PLA Basic'))
        self.assertFalse(material_matches('PLA Basic','PLA Matte'))
        self.assertFalse(material_matches('PLA','PETG HF'))
        self.assertFalse(material_matches('PLA','PLA empty spool'))
        self.assertTrue(material_matches('PETG High Flow / High Speed','PETG HF'))

    def test_structured_price_belongs_to_product(self):
        source={'id':'shop','store':'Shop','kind':'reseller','priority':10}
        products=[{'@type':'Product','name':'PLA 1kg','url':'/pla','offers':{'price':'19.99','priceCurrency':'EUR','availability':'https://schema.org/InStock'}},
                  {'@type':'Product','name':'PETG 1kg','url':'/petg','offers':{'price':'4.99','priceCurrency':'EUR'}}]
        rows=structured_offers('<script type="application/ld+json">'+json.dumps(products)+'</script>',source,'https://shop.test','PLA')
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['price'],19.99)
        self.assertIs(rows[0]['available'],True)

    def test_no_guessed_currency_or_aggregate_variant_price(self):
        source={'id':'shop','store':'Shop','kind':'reseller','priority':10}
        for offer in [{'price':'12','priceCurrency':'USD'},{'lowPrice':'12','priceCurrency':'EUR'}]:
            product={'@type':'Product','name':'PLA','offers':offer}
            self.assertFalse(structured_offers('<script type="application/ld+json">'+json.dumps(product)+'</script>',source,'https://shop.test','PLA'))

    def test_unknown_shipping_is_not_free(self):
        result=server.enrich_final_cost({'price':20,'weight_kg':2},{'shipping':{'type':'checkout'}},3)
        self.assertEqual(result['subtotal'],60)
        self.assertIsNone(result['final_total'])
        self.assertFalse(result['shipping_known'])

    def test_shopify_gross_grams_are_not_net_weight(self):
        product={'title':'PLA','variants':[{'id':1,'price':1999,'grams':1250,'title':'Black','available':True}]}
        with patch.object(server,'fetch_json',return_value=(product,'')):
            row=server.shopify_product_variants(server.SOURCES[0],'https://store.test/products/pla','PLA')[0]
        self.assertEqual(row['price'],19.99)
        self.assertIsNone(row['weight_kg'])

    def test_sold_out_price_does_not_trigger_alert(self):
        snap=server.group_snapshot({'offers':[{'price':5,'available':False},{'price':20,'available':True}]})
        self.assertEqual(snap['best_product_price'],20)


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True)
        cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.http.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.thread.join()

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        for key,filename in [('ALERTS_FILE','alerts.json'),('HISTORY_FILE','history.json'),('EVENTS_FILE','alert_events.json')]:
            ctx=patch.object(server,key,str(Path(self.temp.name)/filename));ctx.start();self.addCleanup(ctx.stop)
        ctx=patch.object(server,'DATA_DIR',self.temp.name);ctx.start();self.addCleanup(ctx.stop)
        server.CACHE.clear()

    def request(self,path,body=None,headers=None):
        h={'Content-Type':'application/json',**(headers or {})}
        req=Request(self.base+path,data=json.dumps(body).encode() if body is not None else None,headers=h)
        try:
            with urlopen(req) as r: return r.status,r.read(),r.headers
        except HTTPError as e: return e.code,e.read(),e.headers

    def test_private_files_are_not_served(self):
        for path in ('/server.py','/catalog_tools.py','/data/alerts.json','/../server.py','/%2e%2e/server.py','/api/missing'):
            self.assertEqual(self.request(path)[0],404,path)

    def test_app_assets_and_security_headers(self):
        for path in ('/','/app.mjs','/domain.mjs','/catalog.json'):
            status,body,headers=self.request(path)
            self.assertEqual(status,200)
            self.assertIn("script-src 'self'",headers['Content-Security-Policy'])
            self.assertEqual(headers['X-Content-Type-Options'],'nosniff')

    def test_invalid_search_is_rejected_before_network(self):
        with patch.object(server,'live_catalog') as search:
            for path in ('/api/catalog?qty=abc','/api/catalog?qty=0','/api/catalog?qty=51','/api/catalog?source=unknown'):
                self.assertEqual(self.request(path)[0],400)
            search.assert_not_called()

    def test_json_shape_validation(self):
        for body in ([],42,{'action':'upsert','alert':{'signature':'x'}},{'action':'toggle','enabled':'yes'}):
            self.assertEqual(self.request('/api/alerts',body)[0],400)

    def test_cross_site_and_form_requests_rejected(self):
        self.assertEqual(self.request('/api/alerts',{}, {'Origin':'https://other.test'})[0],403)
        self.assertEqual(self.request('/api/alerts',{}, {'Content-Type':'text/plain'})[0],415)

    def test_alert_lifecycle_persists(self):
        payload={'signature':'test|pla','label':'Test PLA','material':'PLA','quantity':2,'config':{'drop_enabled':True,'drop_pct':5,'back_in_stock':True}}
        status,body,_=self.request('/api/alerts',{'alert':payload})
        self.assertEqual(status,200)
        alert=json.loads(body)['alert']
        self.assertEqual(server.load_alerts()[0]['quantity'],2)
        self.request('/api/alerts',{'action':'toggle','id':alert['id'],'enabled':False})
        self.assertFalse(server.load_alerts()[0]['enabled'])
        self.request('/api/alerts',{'action':'delete','id':alert['id']})
        self.assertEqual(server.load_alerts(),[])

    def test_invalid_threshold_does_not_change_data(self):
        payload={'signature':'test','label':'Test','material':'PLA','config':{'drop_enabled':True,'drop_pct':-1}}
        self.assertEqual(self.request('/api/alerts',{'alert':payload})[0],400)
        self.assertFalse(server.load_alerts())

    def test_corrupt_persistence_is_not_silently_overwritten(self):
        Path(server.ALERTS_FILE).write_text('{broken',encoding='utf-8')
        with self.assertRaises(json.JSONDecodeError): server.load_alerts()
        self.assertEqual(Path(server.ALERTS_FILE).read_text(),'{broken')

    def test_single_source_and_cache(self):
        def collect(source,material,brand,qty):
            return [server.enrich_final_cost({'source_id':source['id'],'product':'PLA 1kg','brand':'Bambu Lab','price':20,'weight_kg':1,'available':True},source,qty)],{'id':source['id'],'name':source['store'],'ok':True,'results':1}
        with patch.object(server,'_collect_source',side_effect=collect) as mocked:
            a=server.live_catalog('PLA',qty=2,source_filter='bambu')
            b=server.live_catalog('PLA',qty=2,source_filter='bambu')
        self.assertEqual(mocked.call_count,1)
        self.assertEqual([s['id'] for s in a['sources']],['bambu'])
        self.assertTrue(b['cached'])
        self.assertEqual(a['offers'][0]['subtotal'],40)

    def test_different_quantity_does_not_trigger_delivered_price_alert(self):
        server.upsert_alert({'signature':'sig','material':'PLA','label':'PLA','quantity':2,'config':{'max_final_enabled':True,'max_final_value':30}})
        group={'signature':'sig','offers':[{'price':20,'final_total':20,'available':True}]}
        server.record_groups_and_evaluate([group],'PLA','all',1)
        self.assertEqual(server.load_events(),[])


if __name__=='__main__': unittest.main()
