#!/usr/bin/env python3
"""Generate the compact municipal IRPEF registry used by GestOre.

The generator joins:
- the current Istat municipality registry, for names and territorial data;
- the MEF municipal surcharge tables, for rates and exemptions.

Only standard-library modules are used so the dataset can be refreshed without
adding build dependencies.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any


MEF_DOWNLOAD_URL = (
    "https://www1.finanze.gov.it/finanze2/dipartimentopolitichefiscali/"
    "fiscalitalocale/nuova_addcomirpef/download/download.php?anno={year}"
)
MEF_INFO_URL = (
    "https://www1.finanze.gov.it/finanze2/dipartimentopolitichefiscali/"
    "fiscalitalocale/nuova_addcomirpef/download/tabella.htm"
)
ISTAT_DOWNLOAD_URL = (
    "https://www.istat.it/storage/codici-unita-amministrative/"
    "Elenco-comuni-italiani.xlsx"
)

REGION_BY_PROVINCE = {
    "AQ": "Abruzzo", "CH": "Abruzzo", "PE": "Abruzzo", "TE": "Abruzzo",
    "MT": "Basilicata", "PZ": "Basilicata",
    "CS": "Calabria", "CZ": "Calabria", "KR": "Calabria",
    "RC": "Calabria", "VV": "Calabria",
    "AV": "Campania", "BN": "Campania", "CE": "Campania",
    "NA": "Campania", "SA": "Campania",
    "BO": "Emilia-Romagna", "FE": "Emilia-Romagna",
    "FC": "Emilia-Romagna", "MO": "Emilia-Romagna",
    "PR": "Emilia-Romagna", "PC": "Emilia-Romagna",
    "RA": "Emilia-Romagna", "RE": "Emilia-Romagna",
    "RN": "Emilia-Romagna",
    "GO": "Friuli-Venezia Giulia", "PN": "Friuli-Venezia Giulia",
    "TS": "Friuli-Venezia Giulia", "UD": "Friuli-Venezia Giulia",
    "FR": "Lazio", "LT": "Lazio", "RI": "Lazio", "RM": "Lazio",
    "VT": "Lazio",
    "GE": "Liguria", "IM": "Liguria", "SP": "Liguria", "SV": "Liguria",
    "BG": "Lombardia", "BS": "Lombardia", "CO": "Lombardia",
    "CR": "Lombardia", "LC": "Lombardia", "LO": "Lombardia",
    "MN": "Lombardia", "MI": "Lombardia", "MB": "Lombardia",
    "PV": "Lombardia", "SO": "Lombardia", "VA": "Lombardia",
    "AN": "Marche", "AP": "Marche", "FM": "Marche", "MC": "Marche",
    "PU": "Marche",
    "CB": "Molise", "IS": "Molise",
    "AL": "Piemonte", "AT": "Piemonte", "BI": "Piemonte",
    "CN": "Piemonte", "NO": "Piemonte", "TO": "Piemonte",
    "VB": "Piemonte", "VC": "Piemonte",
    "BA": "Puglia", "BT": "Puglia", "BR": "Puglia", "FG": "Puglia",
    "LE": "Puglia", "TA": "Puglia",
    "CA": "Sardegna", "NU": "Sardegna", "OR": "Sardegna",
    "SS": "Sardegna", "SU": "Sardegna",
    "AG": "Sicilia", "CL": "Sicilia", "CT": "Sicilia",
    "EN": "Sicilia", "ME": "Sicilia", "PA": "Sicilia",
    "RG": "Sicilia", "SR": "Sicilia", "TP": "Sicilia",
    "AR": "Toscana", "FI": "Toscana", "GR": "Toscana",
    "LI": "Toscana", "LU": "Toscana", "MS": "Toscana",
    "PI": "Toscana", "PO": "Toscana", "PT": "Toscana",
    "SI": "Toscana",
    "BZ": "Trentino-Alto Adige", "TN": "Trentino-Alto Adige",
    "PG": "Umbria", "TR": "Umbria",
    "AO": "Valle d'Aosta",
    "BL": "Veneto", "PD": "Veneto", "RO": "Veneto",
    "TV": "Veneto", "VE": "Veneto", "VI": "Veneto", "VR": "Veneto",
}

REGION_ALIASES = {
    "Trentino-Alto Adige/Sudtirol": "Trentino-Alto Adige",
    "Trentino-Alto Adige/Suedtirol": "Trentino-Alto Adige",
    "Valle d'Aosta/Vallee d'Aoste": "Valle d'Aosta",
}

STANDARD_UPPER_LIMITS = {
    3: [28000.0, 50000.0],
    4: [15000.0, 28000.0, 50000.0],
}

FLAG_FALLBACK = 1
FLAG_PROVISIONAL = 2
FLAG_LIMITED = 4

XLSX_NS = {
    "x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
}


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "GestOre tax updater"})
    with urllib.request.urlopen(request, timeout=60) as response:
        target.write_bytes(response.read())


def parse_decimal(value: Any) -> float | None:
    text = str(value or "").strip().replace("*", "")
    if not text:
        return None
    normalized = text.replace(".", "").replace(",", ".")
    try:
        return float(normalized)
    except ValueError:
        return None


def compact_number(value: float | int) -> float | int:
    rounded = round(float(value), 4)
    return int(rounded) if rounded.is_integer() else rounded


def excel_column_index(cell_reference: str) -> int:
    match = re.match(r"([A-Z]+)", cell_reference)
    if not match:
        return -1
    value = 0
    for character in match.group(1):
        value = value * 26 + ord(character) - 64
    return value - 1


def read_istat_municipalities(path: Path) -> dict[str, dict[str, str]]:
    with zipfile.ZipFile(path) as archive:
        shared_strings_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared_strings = [
            "".join(node.text or "" for node in item.findall(".//x:t", XLSX_NS))
            for item in shared_strings_root.findall("x:si", XLSX_NS)
        ]
        sheet_root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))

    municipalities: dict[str, dict[str, str]] = {}
    rows = sheet_root.findall(".//x:sheetData/x:row", XLSX_NS)
    for row in rows[1:]:
        values: dict[int, str] = {}
        for cell in row.findall("x:c", XLSX_NS):
            value_node = cell.find("x:v", XLSX_NS)
            value = "" if value_node is None else (value_node.text or "")
            if cell.get("t") == "s" and value:
                value = shared_strings[int(value)]
            values[excel_column_index(cell.get("r", ""))] = value.strip()

        code = values.get(20, "")
        if not code:
            continue
        region = values.get(10, "")
        region = REGION_ALIASES.get(
            region.replace("ü", "u").replace("é", "e"),
            region,
        )
        municipalities[code] = {
            "code": code,
            "name": values.get(6, "") or values.get(5, ""),
            "province": values.get(14, ""),
            "region": region,
        }
    return municipalities


def read_mef_rows(path: Path) -> dict[str, dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source, delimiter=";"))
    return {
        str(row.get("CODICE_CATASTALE") or "").strip(): row
        for row in rows
        if str(row.get("CODICE_CATASTALE") or "").strip()
    }


def iter_rate_entries(row: dict[str, str]) -> list[tuple[float, str]]:
    entries: list[tuple[float, str]] = []
    for index in range(1, 13):
        rate_key = "ALIQUOTA" if index == 1 else f"ALIQUOTA_{index}"
        range_key = "FASCIA" if index == 1 else f"FASCIA_{index}"
        rate = parse_decimal(row.get(rate_key))
        if rate is not None:
            entries.append((rate, str(row.get(range_key) or "").strip()))
    return entries


def extract_income_limits(description: str) -> list[float]:
    values: list[float] = []
    pattern = r"(?<![A-Za-z])([0-9][0-9.]*(?:,[0-9]+)?)(?![A-Za-z])"
    for token in re.findall(pattern, description or ""):
        value = parse_decimal(token)
        if value is not None and value >= 100:
            values.append(value)
    return values


def parse_mef_tax_rule(row: dict[str, str]) -> dict[str, Any]:
    zero_star = str(row.get("ALIQUOTA") or "").strip() == "0*"
    source_flag = str(row.get("FLAG_NUOVA") or "").strip()
    exemption = parse_decimal(row.get("IMPORTO_ESENTE")) or 0
    positive_entries = [
        (rate, description)
        for rate, description in iter_rate_entries(row)
        if rate > 0
    ]

    if zero_star or not positive_entries:
        return {
            "exemption": 0,
            "brackets": [(None, 0)],
            "provisional": zero_star,
            "limited": False,
        }

    flat_entry = next(
        (
            (rate, description)
            for rate, description in positive_entries
            if "aliquota unica" in description.lower()
        ),
        None,
    )
    if len(positive_entries) == 1 or flat_entry:
        rate = (flat_entry or positive_entries[0])[0]
        return {
            "exemption": exemption,
            "brackets": [(None, rate)],
            "provisional": False,
            "limited": source_flag in {"0", "5", "6"},
        }

    upper_limits: list[float | None] = []
    inferred_limits = False
    previous = 0.0
    for index, (_, description) in enumerate(positive_entries):
        if index == len(positive_entries) - 1:
            upper_limits.append(None)
            continue
        candidates = extract_income_limits(description)
        upper = max(candidates) if candidates else None
        if upper is None or upper <= previous:
            inferred_limits = True
            upper = None
        upper_limits.append(upper)
        if upper is not None:
            previous = upper

    if inferred_limits or any(limit is None for limit in upper_limits[:-1]):
        standard = STANDARD_UPPER_LIMITS.get(len(positive_entries))
        if not standard:
            raise ValueError(
                f"Unable to infer brackets for {row.get('COMUNE')} "
                f"({len(positive_entries)} rates)"
            )
        upper_limits = list(standard) + [None]
        inferred_limits = True

    return {
        "exemption": exemption,
        "brackets": [
            (upper_limits[index], rate)
            for index, (rate, _) in enumerate(positive_entries)
        ],
        "provisional": False,
        "limited": source_flag in {"0", "5", "6"} or inferred_limits,
    }


def title_case_name(value: str) -> str:
    return " ".join(part.capitalize() for part in str(value or "").split())


def municipality_identity(
    code: str,
    mef_row: dict[str, str],
    istat_rows: dict[str, dict[str, str]],
) -> dict[str, str]:
    official = istat_rows.get(code)
    if official:
        return official
    province = str(mef_row.get("PR") or "").strip()
    return {
        "code": code,
        "name": title_case_name(str(mef_row.get("COMUNE") or "")),
        "province": province,
        "region": REGION_BY_PROVINCE.get(province, ""),
    }


def pack_tax_row(
    identity: dict[str, str],
    rule: dict[str, Any],
    source_year: int,
    flags: int,
) -> list[Any]:
    packed_brackets: list[Any] = []
    for upper, rate in rule["brackets"]:
        packed_brackets.extend(
            [
                None if upper is None else compact_number(upper),
                compact_number(rate),
            ]
        )
    return [
        identity["code"],
        identity["name"],
        identity["province"],
        identity["region"],
        compact_number(rule["exemption"]),
        packed_brackets,
        source_year,
        flags,
    ]


def build_year_rows(
    year: int,
    mef_rows: dict[int, dict[str, dict[str, str]]],
    istat_rows: dict[str, dict[str, str]],
) -> list[list[Any]]:
    current_rows = mef_rows[year]
    if year == 2026:
        codes = sorted(istat_rows)
    else:
        codes = sorted(current_rows)

    packed: list[list[Any]] = []
    for code in codes:
        current = current_rows.get(code)
        if not current:
            raise ValueError(f"MEF {year}: missing municipality {code}")

        source_year = year
        source = current
        flags = 0
        if year == 2026 and str(current.get("ALIQUOTA") or "").strip() == "0*":
            previous = mef_rows.get(2025, {}).get(code)
            if previous and str(previous.get("ALIQUOTA") or "").strip() != "0*":
                source = previous
                source_year = 2025
                flags |= FLAG_FALLBACK

        rule = parse_mef_tax_rule(source)
        if rule["provisional"]:
            flags |= FLAG_PROVISIONAL
        if rule["limited"]:
            flags |= FLAG_LIMITED

        identity = municipality_identity(code, current, istat_rows)
        packed.append(pack_tax_row(identity, rule, source_year, flags))

    packed.sort(key=lambda item: (str(item[1]).casefold(), item[0]))
    return packed


def render_javascript(year_rows: dict[int, list[list[Any]]]) -> str:
    lines = [
        "/* Generated by tools/generate_municipal_taxes.py. Do not edit manually. */",
        "(function (root, factory) {",
        "  var api = factory();",
        "  if (typeof module === 'object' && module.exports) module.exports = api;",
        "  root.GestOreMunicipalTaxData = api;",
        "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {",
        "  'use strict';",
        "",
        "  var FLAG_FALLBACK = 1;",
        "  var FLAG_PROVISIONAL = 2;",
        "  var FLAG_LIMITED = 4;",
        "  var DATA = {",
    ]
    years = sorted(year_rows)
    for year_index, year in enumerate(years):
        lines.append(f"    {year}: [")
        rows = year_rows[year]
        for row_index, row in enumerate(rows):
            suffix = "," if row_index < len(rows) - 1 else ""
            lines.append(
                "      "
                + json.dumps(row, ensure_ascii=False, separators=(",", ":"))
                + suffix
            )
        year_suffix = "," if year_index < len(years) - 1 else ""
        lines.append(f"    ]{year_suffix}")
    lines.extend(
        [
            "  };",
            "  var rowCache = {};",
            "  var optionCache = {};",
            "  var indexCache = {};",
            "",
            "  function normalize(value) {",
            "    return String(value || '')",
            "      .normalize('NFD')",
            "      .replace(/[\\u0300-\\u036f]/g, '')",
            "      .toLowerCase()",
            "      .replace(/[^a-z0-9]/g, '');",
            "  }",
            "",
            "  function unpack(row, taxYear) {",
            "    var packedBrackets = row[5] || [];",
            "    var brackets = [];",
            "    var from = 0;",
            "    for (var index = 0; index < packedBrackets.length; index += 2) {",
            "      var to = packedBrackets[index];",
            "      brackets.push({ from: from, to: to, rate: packedBrackets[index + 1] });",
            "      if (to !== null) from = to;",
            "    }",
            "    var flags = Number(row[7]) || 0;",
            "    return {",
            "      municipalityCode: row[0],",
            "      municipalityName: row[1],",
            "      province: row[2],",
            "      region: row[3],",
            "      taxYear: Number(taxYear),",
            "      exemptionThreshold: Number(row[4]) || 0,",
            "      brackets: brackets,",
            "      mode: brackets.length > 1 ? 'progressive' :",
            "        (brackets[0] && brackets[0].rate > 0 ? 'flat' : 'none'),",
            "      advanceRate: 30,",
            "      balanceRate: 70,",
            "      sourceYear: Number(row[6]) || Number(taxYear),",
            "      fallback: Boolean(flags & FLAG_FALLBACK),",
            "      provisional: Boolean(flags & FLAG_PROVISIONAL),",
            "      limited: Boolean(flags & FLAG_LIMITED),",
            "      sourceLabel: 'Dipartimento delle Finanze - MEF'",
            "    };",
            "  }",
            "",
            "  function getRows(taxYear) {",
            "    return DATA[Number(taxYear)] || [];",
            "  }",
            "",
            "  function getRegionRows(taxYear, region) {",
            "    var key = Number(taxYear) + '|' + normalize(region);",
            "    if (!rowCache[key]) {",
            "      var regionLookup = normalize(region);",
            "      rowCache[key] = getRows(taxYear).filter(function (row) {",
            "        return !regionLookup || normalize(row[3]) === regionLookup;",
            "      });",
            "    }",
            "    return rowCache[key];",
            "  }",
            "",
            "  function getIndex(taxYear, region) {",
            "    var year = Number(taxYear);",
            "    var key = year + '|' + normalize(region);",
            "    if (!indexCache[key]) {",
            "      var index = {};",
            "      getRegionRows(year, region).forEach(function (row) {",
            "        index[normalize(row[0])] = row;",
            "        index[normalize(row[1])] = row;",
            "        index[normalize(row[1] + ' ' + row[0])] = row;",
            "      });",
            "      indexCache[key] = index;",
            "    }",
            "    return indexCache[key];",
            "  }",
            "",
            "  function findMunicipality(municipality, taxYear, region) {",
            "    var row = getIndex(taxYear, region)[normalize(municipality)];",
            "    if (!row) return null;",
            "    return unpack(row, taxYear);",
            "  }",
            "",
            "  function getMunicipalityOptions(taxYear, region) {",
            "    var key = Number(taxYear) + '|' + normalize(region);",
            "    if (!optionCache[key]) {",
            "      optionCache[key] = getRegionRows(taxYear, region).map(function (row) {",
            "        return unpack(row, taxYear);",
            "      });",
            "    }",
            "    return optionCache[key].slice();",
            "  }",
            "",
            "  function searchMunicipalities(query, taxYear, region, limit) {",
            "    var lookup = normalize(query);",
            "    var max = Math.max(1, Math.min(30, Number(limit) || 8));",
            "    if (lookup.length < 2) return [];",
            "    var scored = [];",
            "    getRegionRows(taxYear, region).forEach(function (row) {",
            "      var name = normalize(row[1]);",
            "      var code = normalize(row[0]);",
            "      var position = name.indexOf(lookup);",
            "      var score = -1;",
            "      if (name === lookup || code === lookup) score = 0;",
            "      else if (name.indexOf(lookup) === 0 || code.indexOf(lookup) === 0) score = 1;",
            "      else if (position > 0) score = 2 + position / 1000;",
            "      if (score >= 0) scored.push({ score: score, row: row });",
            "    });",
            "    scored.sort(function (a, b) {",
            "      return a.score - b.score || String(a.row[1]).localeCompare(String(b.row[1]), 'it');",
            "    });",
            "    return scored.slice(0, max).map(function (item) {",
            "      return unpack(item.row, taxYear);",
            "    });",
            "  }",
            "",
            "  return {",
            "    sourceUrl: "
            + json.dumps(MEF_INFO_URL)
            + ",",
            "    counts: {"
            + ",".join(f"{year}:{len(year_rows[year])}" for year in years)
            + "},",
            "    findMunicipality: findMunicipality,",
            "    getMunicipalityOptions: getMunicipalityOptions,",
            "    searchMunicipalities: searchMunicipalities",
            "  };",
            "});",
            "",
        ]
    )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--tmp-dir", type=Path, default=project_root / "tmp")
    parser.add_argument(
        "--output",
        type=Path,
        default=project_root
        / "app"
        / "frontend"
        / "js"
        / "tax-config"
        / "municipal-taxes.generated.js",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.tmp_dir.mkdir(parents=True, exist_ok=True)
    mef_paths = {
        year: args.tmp_dir / f"addizionale-comunale-{year}.csv"
        for year in (2025, 2026)
    }
    istat_path = args.tmp_dir / "elenco-comuni-istat-2026.xlsx"

    if args.refresh:
        for year, path in mef_paths.items():
            download(MEF_DOWNLOAD_URL.format(year=year), path)
        download(ISTAT_DOWNLOAD_URL, istat_path)

    missing = [
        path
        for path in [*mef_paths.values(), istat_path]
        if not path.exists()
    ]
    if missing:
        raise FileNotFoundError(
            "Missing source files: " + ", ".join(str(path) for path in missing)
        )

    istat_rows = read_istat_municipalities(istat_path)
    if len(istat_rows) != 7894:
        raise ValueError(f"Expected 7,894 current municipalities, got {len(istat_rows)}")

    mef_rows = {year: read_mef_rows(path) for year, path in mef_paths.items()}
    year_rows = {
        year: build_year_rows(year, mef_rows, istat_rows)
        for year in (2025, 2026)
    }
    if len(year_rows[2026]) != 7894:
        raise ValueError("The 2026 registry must contain all 7,894 current municipalities")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render_javascript(year_rows), encoding="utf-8", newline="\n")

    fallback_count = sum(1 for row in year_rows[2026] if row[7] & FLAG_FALLBACK)
    provisional_count = sum(1 for row in year_rows[2026] if row[7] & FLAG_PROVISIONAL)
    limited_count = sum(1 for row in year_rows[2026] if row[7] & FLAG_LIMITED)
    print(
        f"Generated {len(year_rows[2026])} current municipalities for 2026 "
        f"({fallback_count} fallbacks, {provisional_count} provisional, "
        f"{limited_count} limited)."
    )
    print(f"Output: {args.output}")


if __name__ == "__main__":
    main()
