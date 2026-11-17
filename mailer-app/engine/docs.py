"""Turns an uploaded file into a table the import screen can read. CSV and text files are read as they are. A PDF is read for
its text, and every email address in it becomes a row, with the words next to it as a name guess and as context."""
import csv
import io
import re

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
JUNK = ("example.com", ".png", ".jpg", ".gif")


def pdf_text(data):
    from pypdf import PdfReader
    r = PdfReader(io.BytesIO(data))
    return "\n".join((p.extract_text() or "") for p in r.pages)


def guess_name(line, email):
    """A first name from the words beside the address, or from the start of the address itself (ann.lee@ gives Ann)."""
    rest = EMAIL.sub(" ", line)
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z'-]{1,20}", rest) if w[0].isupper() and w.lower() not in ("email", "mail", "contact", "tel", "phone", "website", "www")]
    if words:
        return words[0]
    local = re.split(r"[._+-]", email.split("@")[0])[0]
    return local.capitalize() if local.isalpha() and 2 < len(local) < 14 else ""


def text_to_csv(text):
    """Every email found in free text, one row each, in the order they appear, without repeats."""
    seen, rows = set(), []
    for line in str(text).splitlines():
        for m in EMAIL.finditer(line):
            e = m.group(0).lower().strip(".,;:<>()[]")
            if e in seen or any(j in e for j in JUNK):
                continue
            seen.add(e)
            ctx = re.sub(r"\s+", " ", EMAIL.sub("", line)).strip(" ,;:|-")[:80]
            rows.append([e, guess_name(line, e), ctx])
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Email", "Name", "Context"])
    w.writerows(rows)
    return buf.getvalue()


def pdf_to_csv(data):
    return text_to_csv(pdf_text(data))
