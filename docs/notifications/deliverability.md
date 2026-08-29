# Notification deliverability

The local stack uses Mailpit and fake providers. Production provider credentials and DNS are deliberately outside this epic; use the following checklist when a sending domain is configured.

## Domain records

- SPF: publish one TXT record for the platform envelope sender, including the chosen provider. Keep a single SPF record and merge mechanisms when another service already sends mail.
- DKIM: publish every selector supplied by Resend (or the selected SMTP provider) as a CNAME/TXT record before enabling the domain.
- DMARC: start with `v=DMARC1; p=none; rua=mailto:dmarc@your-domain.example`, review aggregate reports, then move to quarantine/reject once legitimate senders pass alignment.

## Provider operations

1. Add and verify the sending domain in Resend, then publish its SPF/DKIM records.
2. Send a small internal batch and verify From alignment, links, and unsubscribe handling.
3. Warm up gradually; monitor delivery, bounce, complaint, and suppression rates.
4. Treat hard bounces and complaints as permanent suppression. Never repeatedly retry them.

For Termii, register the sender ID and use the transactional route for Nigerian traffic. Check the current DND and consent requirements for each destination before enabling SMS.

WhatsApp messages require an approved template, language, and parameter schema in Meta Business Manager before the Meta adapter can be enabled.
