# ruff: noqa: E501 (the wording is prose)
"""The tenancy agreement's wording. Edit it here; existing agreements keep the wording they were made with.

DRAFT: this wording was written as a placeholder and hasn't been reviewed by a lawyer. Every document says so
until DRAFT_WORDING is set to False. Have a Ghanaian lawyer approve or replace it, including whether signing
this way is enough, before real tenants sign it.

"## " starts a heading. {{Placeholders}} are filled in when the room is allocated.
"""

DRAFT_WORDING = True
LANDLORD_NAME = "Altheo Homes"
LEASE_YEARS = 1

TEMPLATE = """\
This Tenancy Agreement is made between {{Landlord}} (the "Landlord") and {{Tenant Full Name}} (the "Tenant").

## 1. The home
The Landlord lets to the Tenant room {{Room Identification Number}}, a {{Room Type}}, at {{Building Name & Location}} (the "Premises").

## 2. How long
The tenancy starts on {{Lease Start Date}} and ends on {{Lease End Date}}, unless ended earlier under this Agreement.

## 3. Rent and sanitation
The Tenant will pay rent of {{Monthly Rent}} a month and a sanitation fee of {{Monthly Sanitation}} a month. These amounts stay the same for the length of this Agreement unless both parties agree otherwise in writing.

## 4. Deposits
The Tenant has paid a refundable booking deposit of {{Booking Deposit}}. The Tenant will pay a renting security deposit of {{Renting Deposit}} after signing this Agreement. The Landlord holds the deposits against unpaid amounts and damage beyond fair wear and tear, and will return what remains when the tenancy ends, with a written account of any deductions.

## 5. The Tenant agrees to
Pay amounts when due; keep the Premises clean and in good condition; report repairs promptly; not make alterations without written permission; not sublet without written permission; respect neighbours and the shared parts of the building; and let the Landlord in, on reasonable notice, for inspections and repairs.

## 6. The Landlord agrees to
Give the Tenant quiet enjoyment of the Premises; keep the building's structure and shared services in reasonable repair; and act on reported repairs within a reasonable time.

## 7. Ending the tenancy
Either party may end this tenancy early by giving the other at least one month's written notice, without affecting amounts already owed. On leaving, the Tenant will return the keys and leave the Premises clean and in good condition.

## 8. General
This Agreement is governed by the laws of the Republic of Ghana. It is the whole agreement between the parties and may only be changed in writing. By signing, each party confirms they have read and understood it.
"""
