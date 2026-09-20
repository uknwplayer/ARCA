#!/usr/bin/env python3
import os
import pathlib
import smtplib
import ssl
from email.message import EmailMessage

def required(name):
    value=os.environ.get(name,"").strip()
    if not value:
        raise RuntimeError(f"{name} required")
    return value

sender=required("ARCA_EMAIL_USER")
password=required("ARCA_EMAIL_APP_PASSWORD")
recipient=required("ARCA_EMAIL_TO")
base=pathlib.Path(os.environ.get("ARCA_STATUS_OUT",".arca-status"))
subject=(base/"email-subject.txt").read_text(encoding="utf-8").strip()
body=(base/"status.md").read_text(encoding="utf-8")

message=EmailMessage()
message["From"]=sender
message["To"]=recipient
message["Subject"]=subject
message["Reply-To"]=sender
message.set_content(body)

context=ssl.create_default_context()
with smtplib.SMTP_SSL("smtp.gmail.com",465,context=context,timeout=30) as smtp:
    smtp.login(sender,password)
    smtp.send_message(message)

print("ARCA status email sent")
