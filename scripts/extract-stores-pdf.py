"""
Extract Jan Aushadhi Kendra store data from the official PMBJP PDF.
Outputs scripts/data/jan-aushadhi-stores.json

Usage: python3 scripts/extract-stores-pdf.py
Requires: pip install pdfplumber
"""

import json
import os
import re
import pdfplumber

PDF_PATH = os.path.expanduser(
    "~/Downloads/listofjanaushadhikendras0-220816082624-e6d76dc3.pdf"
)
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "data", "jan-aushadhi-stores.json")

STORE_ID_RE = re.compile(r"PMBJK\d{5}")
PINCODE_RE = re.compile(r"\b\d{6}\b")
PHONE_RE = re.compile(r"\b[\d]{10,11}\b")


def extract_stores():
    stores = []
    pdf = pdfplumber.open(PDF_PATH)

    current_state = None
    current_district = None

    for page_num, page in enumerate(pdf.pages):
        text = page.extract_text()
        if not text:
            continue

        lines = text.split("\n")

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Try to find a store ID in this line
            store_match = STORE_ID_RE.search(line)
            if not store_match:
                # Could be a continuation line or header - skip
                continue

            kendra_id = store_match.group()

            # Parse the line - typical format:
            # S.No PMBJKXXXXX State District Block Address Pincode ContactPerson ContactDetails
            # Split by the store ID to get parts after it
            after_id = line[store_match.end():].strip()

            # Try to identify state and district from known patterns
            # The PDF has columns: S.No, Store No, State, District, Blocks, Address, Pincode, Contact, Phone
            # But text extraction merges them. We'll parse heuristically.

            parts = after_id.split()
            if not parts:
                continue

            # Extract pincode (6-digit number)
            pincode = None
            pincode_match = PINCODE_RE.search(after_id)
            if pincode_match:
                pincode = pincode_match.group()

            # Extract phone number (10-11 digits at end)
            contact_details = None
            phone_match = PHONE_RE.search(after_id)
            if phone_match:
                contact_details = phone_match.group()

            # The text between store ID and pincode contains: State, District, Block, Address
            # State and District are at the beginning, address runs until pincode
            if pincode_match:
                middle = after_id[:pincode_match.start()].strip()
                # After pincode is contact person and phone
                after_pincode = after_id[pincode_match.end():].strip()
                # Remove phone from contact person
                contact_person = after_pincode
                if phone_match and phone_match.start() > pincode_match.end():
                    contact_person = after_id[pincode_match.end():phone_match.start()].strip()
            else:
                middle = after_id
                contact_person = None

            # Try to extract state and district from the middle portion
            # Known Indian states
            state = None
            district = None
            block = None
            address = middle

            # Common state names to look for
            state_names = [
                "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
                "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
                "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
                "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
                "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
                "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
                "Andaman And Nicobar Islands", "Chandigarh", "Dadra And Nagar Haveli",
                "Daman And Diu", "Delhi", "Jammu And Kashmir", "Jammu & Kashmir",
                "Ladakh", "Lakshadweep", "Puducherry",
                "Potti Sriramulu Nellore", "Sant Ravidas Nagar",
            ]

            for s in sorted(state_names, key=len, reverse=True):
                if s.lower() in middle.lower():
                    idx = middle.lower().find(s.lower())
                    state = s
                    remainder = middle[idx + len(s):].strip()
                    # First word(s) after state = district, rest = address
                    # This is imperfect but good enough for bulk extraction
                    current_state = state
                    address = remainder
                    break

            if state and address:
                # Try to split district from address
                # District is usually 1-2 words before the actual street address
                # Look for patterns like "D.No", "Shop No", "Room", numbers at start
                addr_indicators = [
                    "D.No", "D. No", "Shop No", "Room", "Plot", "Door No",
                    "Ground Floor", "Ist Floor", "1st Floor", "2nd Floor",
                    "Near", "Opp", "Opposite", "Beside", "In The Premises",
                    "Jan Aushadhi", "M/S", "Pmbjak", "Panchayat",
                ]
                found_addr_start = len(address)
                for indicator in addr_indicators:
                    idx = address.lower().find(indicator.lower())
                    if idx != -1 and idx < found_addr_start:
                        found_addr_start = idx

                # Also check for house number patterns at start of address
                num_pattern = re.search(r"\b\d+[-/]", address)
                if num_pattern and num_pattern.start() < found_addr_start:
                    found_addr_start = num_pattern.start()

                if found_addr_start > 0 and found_addr_start < len(address):
                    district_part = address[:found_addr_start].strip()
                    address = address[found_addr_start:].strip()
                    # District might have block info too
                    dist_words = district_part.split()
                    if len(dist_words) >= 2:
                        district = dist_words[0]
                        block = " ".join(dist_words[1:])
                    elif len(dist_words) == 1:
                        district = dist_words[0]
                    current_district = district
                else:
                    district = current_district

            if not state:
                state = current_state
            if not district:
                district = current_district

            store = {
                "kendraId": kendra_id,
                "state": state,
                "district": district,
                "block": block,
                "address": address.strip(", ") if address else None,
                "pincode": pincode,
                "contactPerson": contact_person.strip(", ") if contact_person else None,
                "contactDetails": contact_details,
            }
            stores.append(store)

    pdf.close()
    return stores


def main():
    print(f"Extracting stores from: {PDF_PATH}")
    stores = extract_stores()
    print(f"Extracted {len(stores)} stores")

    # Deduplicate by kendraId (keep last occurrence)
    seen = {}
    for s in stores:
        seen[s["kendraId"]] = s
    stores = list(seen.values())
    stores.sort(key=lambda s: s["kendraId"])
    print(f"After dedup: {len(stores)} unique stores")

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(stores, f, indent=2, ensure_ascii=False)
    print(f"Written to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
