# Sed expression file applied to twenty-emails/dist/index.mjs and locales/generated/en.js
# during the overlay Docker build. Patches the 12 distinct branded strings inventoried on
# 2026-05-08. Keeps URLs/links untouched (those that point at twenty.com inside the bundle
# remain — small leak, accepted; aim is "no Twenty in user-visible English text").
#
# To verify after build: docker exec server grep -c "Twenty" /app/packages/twenty-emails/dist/index.mjs
# Should drop from ~30 occurrences to <10 (URL strings + technical refs only).

s/Connect to Twenty/Connect to Pinion CRM/g
s/Join your team on Twenty/Join your team on Pinion CRM/g
s/Read Twenty/Read Pinion CRM/g
s/Visit Twenty/Visit Pinion CRM/g
s/Twenty email/Pinion CRM email/g
s/Twenty logo/Pinion CRM logo/g
s/Twenty\.com, Public Benefit Corporation/Pinion Partners LLC/g
s/San Francisco \/ Paris//g
s/Thanks for registering for an account on Twenty!/Thanks for registering for an account on Pinion CRM!/g
s/your Twenty account/your Pinion CRM account/g
s/using Twenty/using Pinion CRM/g
s/use Twenty again/use Pinion CRM again/g
s/What is Twenty?/What is Pinion CRM?/g
s/It's a CRM, a software to help businesses manage their customer data and relationships efficiently\./Pinion CRM is the customer relationship platform powering Pinion Newswire's outreach and editorial workflows./g
