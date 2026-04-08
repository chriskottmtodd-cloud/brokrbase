# RE CRM - Project TODO

## Phase 1: Database Schema
- [x] Design and push schema: contacts, properties, tasks, listings, activities, buyer_interests, notes
- [x] Seed sample data for Idaho MHC/Apartment properties

## Phase 2: Backend API
- [x] tRPC router: contacts (CRUD, dual-role owner/buyer, relational linking)
- [x] tRPC router: properties (CRUD, filters, owner linkage)
- [x] tRPC router: tasks (CRUD, completion tracking, follow-up prompts)
- [x] tRPC router: listings (CRUD, buyer interest tracking, pipeline)
- [x] tRPC router: activities (log calls/emails/meetings, tied to contacts & properties)
- [x] tRPC router: AI note assistant (process notes, extract next steps)
- [x] tRPC router: AI analysis (pricing, outreach, deal suggestions)
- [x] tRPC router: notifications (real-time alerts)
- [x] tRPC router: dashboard (metrics aggregation)

## Phase 3: UI Shell
- [x] Global theme: dark navy/gold professional color scheme
- [x] DashboardLayout with sidebar navigation (all modules)
- [x] Dashboard home page with key metrics widgets
- [x] Responsive layout for desktop use

## Phase 4: Contacts Module
- [x] Contacts list with search and filter
- [x] Contact detail page with full profile
- [x] Dual-role support (owner + buyer flags)
- [x] Conversation/activity history per contact
- [x] Link contact to multiple properties
- [x] Add/edit contact form

## Phase 5: Properties Module & Map
- [x] Properties list/table with advanced filters (unit count, vintage, type, size, status)
- [x] Property detail page with owner linkage
- [x] Interactive map with all 2000+ properties as pins
- [x] Satellite imagery toggle
- [x] Map filter panel (unit count range, vintage year, property type, size)
- [x] Click pin to see property details + conversation history

## Phase 6: Listings Module
- [x] Active listings list view
- [x] Listing detail page
- [x] Buyer interest tracker (100-200 buyers per listing)
- [x] Engagement status per buyer (interested, toured, offered, closed)
- [x] Deal pipeline visualization
- [x] Add/edit listing form

## Phase 7: Interaction Mode & Activity Log
- [x] Daily to-do dashboard (prioritized by urgency)
- [x] Task completion tracking with checkboxes
- [x] Follow-up prompts after task completion
- [x] Activity log: all calls, emails, meetings with timestamps
- [x] Filter activity log by contact, property, date
- [x] Quick-add activity from contact/property pages

## Phase 8: AI Features
- [x] AI Note Assistant: paste long call notes, get summary + next steps
- [x] Auto-populate to-do list from AI-extracted next steps
- [x] AI pricing strategy suggestions per property
- [x] AI buyer behavior analysis per listing
- [x] AI personalized outreach message generator (email + call script)

## Phase 9: Notifications & Polish
- [x] Notifications page with unread count badge
- [x] Notification bell in sidebar with unread count
- [x] Mark read / mark all read functionality
- [x] Polish all UI modules for consistency

## Phase 10: Tests & Delivery
- [x] Vitest tests for key backend procedures (23 tests passing)
- [x] Final checkpoint and delivery

## AI Deal Matching Engine
- [x] Backend: scan all activities/notes for owner sell signals and buyer criteria
- [x] Backend: AI cross-reference engine scoring owner-buyer property matches
- [x] Backend: return ranked match list with reasoning, match score, and contact details
- [x] UI: Deal Matches tab in AI Assistant with match cards and score badges
- [x] UI: Match card shows owner, property, buyer, why it matched, and one-click actions
- [x] UI: Refresh / re-scan button to re-run matching on demand
- [x] Tests: cover the deal matching router

## Follow-Up Radar (Staleness Alerts)
- [x] Backend: query contacts overdue for follow-up based on last activity attempt date (any outcome)
- [x] Backend: priority-based thresholds (hot=7d, warm=14d, cold=30d, inactive=60d) with user override
- [x] Backend: return days-since-last-attempt, attempt count, last outcome, and contact details
- [x] UI: Follow-Up Radar panel on Dashboard showing overdue contacts sorted by days overdue
- [x] UI: Per-contact row shows last attempt date, outcome, days overdue, and quick-action buttons
- [x] UI: Configurable threshold sliders per priority tier
- [x] UI: Filter by owner-only, buyer-only, or both
- [x] Tests: cover the staleness router

## Bug Fixes
- [x] Fix Select.Item empty string value crash on /tasks page
- [x] Fix duplicate Google Maps script load warning

## UX Improvements
- [x] Replace datetime-local input in Add Task modal with date-only calendar popover (defaults to today, highlights next 30 days, month/year navigation)
- [x] Sort tasks: today's Urgent first, then past-due (red), then rest by priority/date
- [x] Add "Affordable Housing" property type to schema, map filters, and property forms
- [x] Google Maps Places Autocomplete on Add Property address field — auto-fills city, county, state, zip, lat/lng
- [x] Right-click on map to add property at that location — reverse geocodes address, opens Add Property modal pre-filled

## Post-Call Intelligence (AI Call Note Processor)
- [x] Backend: AI procedure that parses call notes and returns structured suggested actions
- [x] Backend: Detect completed tasks from note context and suggest marking them done
- [x] Backend: Extract new action items and suggest creating tasks
- [x] Backend: Detect property/contact mentions and suggest linking them
- [x] Backend: Detect deal updates (offer price, timeline, status change) and suggest property updates
- [x] UI: Post-call suggestion panel that appears after logging a call with notes
- [x] UI: Each suggestion is a card with Accept / Dismiss — one click applies the change
- [x] UI: Apply all accepted suggestions in a single batch mutation
- [x] Tests: cover the parseCallNote AI procedure

## Follow-Up Radar Snooze
- [x] Schema: add snoozedUntil timestamp field to contacts table, migrate DB
- [x] Backend: snooze mutation (set snoozedUntil = now + N days)
- [x] Backend: unsnooze mutation (clear snoozedUntil)
- [x] Backend: filter snoozed contacts out of staleContacts query by default; add showSnoozed option
- [x] UI: snooze button on each contact row in Follow-Up Radar with 30/45/60/custom day options
- [x] UI: snoozed contacts section (collapsed by default) showing when each snooze expires
- [x] UI: one-click unsnooze from the snoozed section

## CSV Bulk Property Import
- [x] Backend: tRPC procedure to accept parsed CSV rows and bulk-insert properties
- [x] Backend: batch geocoding using Google Maps Geocoding API for address → lat/lng
- [x] Backend: return per-row results (success/skipped/failed) with geocoding status
- [x] UI: drag-and-drop CSV upload with file validation
- [x] UI: auto-detect column headers and suggest field mappings
- [x] UI: interactive field mapping dropdowns (CSV column → CRM field)
- [x] UI: preview table of first 5 rows with mapped values
- [x] UI: import progress bar with live row-by-row status
- [x] UI: results summary (imported, geocoded, skipped, failed)
- [x] Navigation: Import link in Properties section of sidebar
- [x] Tests: cover the bulk import procedure
- [x] Fix duplicate React key warnings on /properties/:id (keys: address, ownerName, name)

## Enhanced Property Importer (Excel + Notes)
- [x] Add xlsx library support so .xlsx files can be uploaded directly (no CSV export needed)
- [x] Default property type to "apartment" when unmapped or unrecognized
- [x] Save all unmapped columns as structured notes on each property (key: value format)
- [x] UI: accept .xlsx and .csv files in the drag-and-drop zone
- [x] UI: unmapped columns default to "Save as Notes" instead of "Skip"
- [x] UI: show a preview of what the notes block will look like for a sample row
- [x] Fix duplicate React key warnings on /map page (keys: address, ownerName, notes, name) in Add Property modal SelectItems

## Batch Geocoding for Existing Properties
- [x] Backend: tRPC procedure to geocode all properties missing lat/lng using city/state/zip or address
- [x] UI: "Geocode Missing Coordinates" button on Properties page with progress indicator
- [x] UI: show count of properties needing geocoding before starting

## Duplicate Detection on Import
- [x] Backend: before inserting each row, check for existing property with same name or address
- [x] Backend: return duplicate info in per-row results (skipped_duplicate vs inserted)
- [x] UI: show duplicate count in import results summary
- [x] UI: option to skip or overwrite duplicates in the import flow

## Bulk Contact Import
- [x] UI: new "Import Contacts" page with same CSV/Excel drag-and-drop flow as properties
- [x] UI: field mapping for contact fields (name, email, phone, role, notes, linked property)
- [x] UI: auto-link imported contacts to existing properties by owner name match
- [x] Backend: tRPC procedure to bulk-insert contacts with optional property linking
- [x] Navigation: Import Contacts link in sidebar under Contacts section
- [x] Tests: cover the bulk contact import procedure

## Map Bug Fix
- [x] Diagnose why properties are not showing as pins on the map
- [x] Fix the root cause (missing coords, broken query, or rendering issue)
- [x] Geocode all 66 properties so they all appear on the map

## Map Owner Info in Popup
- [x] Show owner name and company in map property popup when pin is clicked
- [x] Link to contact detail page from the popup if owner contact exists

## Property Detail - Owner Info
- [x] Show Owner Company field on property detail page
- [x] Show Owner Contact name (linked to contact detail page)
- [x] Show "Other Deals" section listing other properties owned by same contact

## Enriched Excel Import (Combined Properties + Contacts)
- [x] Backend: tRPC procedure that accepts the enriched Excel format and imports both contacts and properties
- [x] Handle Contact 1 + Contact 2 per row, both linked to the property
- [x] Deduplicate properties by name+address before inserting
- [x] UI: one-click import page for the enriched format
- [x] Geocode all imported properties after insert

## Back-to-Map Navigation
- [x] Pass from=map query param when navigating from map popup to property detail
- [x] Update PropertyDetail back button to return to /map when from=map is set

## Map Position Persistence
- [x] Save map center/zoom to sessionStorage on idle/move
- [x] Restore saved center/zoom when map initializes

## AI Assistant - Smart Logging Flows
- [x] Backend: summarizeAndDetectContact procedure (LLM summarizes text, detects contact name, returns summary + confidence)
- [x] Backend: summarizeAndDetectProperty procedure (LLM summarizes text, detects property name, returns summary + confidence)
- [x] Backend: saveContactActivity procedure (log activity on a contact directly, not just a property)
- [x] UI: "Log Call/Email" mode tab in AI Assistant with paste area, AI summary, contact confirm/search, save button
- [x] UI: "Log Deal Intel" mode tab in AI Assistant with paste area, AI summary, property confirm/search, save button
- [x] UI: contact search dropdown in confirm dialog
- [x] UI: property search dropdown in confirm dialog

## Refactor + Upsert Redesign
- [x] Split routers.ts into 8 focused files under server/routers/
- [x] Add unique index on (address, city, zip) to properties schema
- [x] Redesign properties.bulkImport as true upsert with field-level merging
- [x] Update Import Properties UI with "Update Existing" mode toggle (duplicateMode: skip/update/insert)
- [x] Update enriched file importer to use upsert logic
- [x] Run full test suite to confirm no regressions (31/31 passing)

## Buyer Criteria Profile & Property Matching
- [x] Schema: add buyer_criteria table (contactId, propertyTypes, minUnits, maxUnits, minVintageYear, maxVintageYear, minPrice, maxPrice, markets/cities, statuses, notes)
- [x] Backend: upsert buyer criteria procedure (one criteria profile per buyer contact)
- [x] Backend: matchPropertiesForBuyer procedure (query properties against saved criteria)
- [x] Backend: matchBuyersForProperty procedure (find all buyers whose criteria match a given property)
- [x] UI: Buyer Criteria editor panel on Contact detail page (visible only for buyer contacts)
- [x] UI: Matched Properties panel on Contact detail — list of inventory that fits this buyer
- [x] UI: Matched Buyers panel on Property detail — list of buyers interested in this property
- [x] Tests: cover criteria upsert and matching procedures (19 tests, all passing)

## Map View Redesign (Primary Interface)
- [x] Make Map View the default route (redirect / → /map)
- [x] Typed pins: unique icon per asset type (MHC, Apartment, Affordable Housing, Storage, Mixed Use)
- [x] Color-coded pins by deal status (grey=tracking, blue=prospect, cyan=contacted, amber=negotiating, green=under contract, purple=listed)
- [x] Address search bar on map — jump to address, highlight if in system
- [x] Multi-select asset type filter bar (All / MHC / Apartment / Affordable / Storage / Mixed)
- [x] Property quick-view popup on pin click (owner name+phone, units, vintage, status, "Open Full Record" button)

## Map-Aware Navigation (Prospecting Flow)
- [x] MapView: pass ?from=map&propertyId=X when clicking Owner button in popup
- [x] ContactDetail: detect from=map param, show "Back to Map" button routing to /map?highlight=X
- [x] MapView: on load with ?highlight=X, auto-open that property's popup at saved map position

## New Status: Under Construction
- [x] Add under_construction to schema enum and push migration
- [x] Add to all UI status lists (MapView colors/labels, Properties filters, PropertyDetail, ContactDetail, ImportProperties)

## Status Redesign (5 statuses)
- [x] Update schema enum: researching, prospecting, seller, listed, recently_sold
- [x] Migrate all existing rows to researching
- [x] Update backend PROPERTY_STATUS array
- [x] Update all UI files (MapView, Properties, PropertyDetail, ContactDetail, ImportProperties)

## Import UI Fix
- [x] Replace switch toggle with 3-option selector for duplicate mode (skip / update existing / always insert)

## Dashboard Redesign + My Listing Flag
- [x] Add isMyListing boolean column to properties schema and run db:push
- [x] Update property update/create procedures to accept isMyListing
- [x] Add My Listing toggle to PropertyDetail (toggleable button in header)
- [x] Cap rate shown in Financials card when present; editable via property update
- [x] Add dashboard tRPC queries: due tasks, overdue contacts count, my listings, on market, recently sold
- [x] Redesign Dashboard.tsx: Tasks panel, Radar summary card, My Listings panel, On Market panel, Recently Sold panel

## Email Studio Integration
- [ ] Add ai.processEmail tRPC procedure (server-side LLM call with style prompt)
- [ ] Drop EmailStudio.tsx into client/src/pages/, wire to tRPC procedure
- [ ] Add /email-studio route in App.tsx
- [ ] Add Email Studio nav item in DashboardLayout sidebar under AI Tools

## Contact Search Fix + Auto-Tagging
- [x] Fix contact search: add CONCAT(firstName, ' ', lastName) LIKE to support full-name queries
- [x] Add contact_property_links table to schema (contactId, propertyId, listingId, source, label)
- [x] Run db:push to create the new table
- [x] Add DB helpers: createContactPropertyLink, getContactPropertyLinks, deleteContactPropertyLink, getContactsForProperty
- [x] Create contactLinksRouter with listForContact, listForProperty, create, delete procedures
- [x] Register contactLinksRouter in appRouter
- [x] Wire auto-tagging in EmailStudio: createContact, ambiguous pick, change picker, dup warning "Use this"
- [x] Wire auto-tagging in AIAssistant QuickLog: handleSaveAll (property, listing, buyer interest)
- [x] Add Linked Deals card to ContactDetail left column with manual add/remove UI
- [x] Add contactLinks router tests (60 tests passing)

## Ghost Contact Search Fix (utf8mb4_bin collation)
- [x] Diagnose: DB collation is utf8mb4_bin (case-sensitive), so LIKE '%david%' doesn't match 'David'
- [x] Fix getContacts: wrap all LIKE comparisons in LOWER() on both sides
- [x] Fix getProperties: same LOWER() fix for name/address/city search
- [x] Verified: all 4 Davids including Vargo now appear in search results
- [x] 60 tests passing, no regressions

## Name Casing Normalizer
- [ ] Backend: tRPC mutation to title-case firstName, lastName, company for all contacts where name is ALL-CAPS
- [ ] UI: "Fix Name Casing" button on Contacts page with preview count and confirmation

## Linked Contacts on Property Detail
- [ ] UI: Add "Linked Contacts" card to PropertyDetail showing contacts from contact_property_links
- [ ] UI: Each row links to contact detail page, shows source label (Email Studio / AI Assistant / Manual)
- [ ] UI: Manual add button to link any contact to the property from the property page

## Global Search Bar
- [ ] Backend: tRPC procedure globalSearch(query) returning contacts + properties + listings grouped
- [ ] UI: Search bar in DashboardLayout sidebar header (cmd+K shortcut)
- [ ] UI: Dropdown results grouped by type (Contacts, Properties, Listings) with icons and click-to-navigate
- [ ] UI: Keyboard navigation (arrow keys, Enter to select, Escape to close)

## Three-Feature Batch (Mar 2026)
- [x] Name casing normalizer - Fix ALL-CAPS/all-lowercase contact names to Title Case (button on Contacts page)
- [x] Linked Contacts on Property Detail - panel showing all contacts tagged to a property, with manual add/remove
- [x] Global search command palette - Cmd+K opens unified search across contacts, properties, and listings

## Dashboard + Map Listing Status (Mar 2026)
- [ ] Rename "On Market" dashboard section to "Under Contract", filter by pending stage
- [ ] Map icon color: pending/under-contract listings show distinct color (amber/orange)

## Dashboard + Map Under Contract (completed)
- [x] Rename "On Market" dashboard panel to "Under Contract"
- [x] Wire dashboard "Under Contract" panel to listings with stage=under_contract
- [x] Update map pin: amber border + UC badge for properties with under_contract listings
- [x] Add under_contract to statusColors and statusLabels on map

## Listing-to-Property Status Sync (completed)
- [x] Add under_contract to property status enum and run migration
- [x] Add syncPropertyStatusFromListing and listingStageToPropertyStatus helpers in db.ts
- [x] Call sync in listings.create after insert (if propertyId set)
- [x] Call sync in listings.update after stage change
- [x] Under Contract now shows as native property status on map (amber pin border)

## Quick Task Actions (completed)
- [x] Add hover quick-complete button (green checkmark) on each task row
- [x] Add hover quick-snooze dropdown (Tomorrow / 3 days / 1 week / 1 month) on each task row
- [x] Actions appear on hover without opening the task, hidden when expanded

## Buyer Intelligence System (Mar 10)
- [x] Add pricePointFeedback, aiScore, aiRationale, aiFollowUpFlag, aiRankedAt to buyerInterests schema
- [x] Run db:push migration for buyer intel fields
- [x] Create buyerIntel tRPC router: updatePricePoint, rankBuyers (AI), generateReport (PDF)
- [x] Inline price point editing on buyer row (click to edit, Enter to save)
- [x] AI rank badge on each buyer row (color-coded score 1-10)
- [x] Follow-up flag amber badge on buyer row
- [x] New buyer green badge (added within last 2 weeks)
- [x] AI rationale shown below buyer row after ranking
- [x] AI market summary panel shown after ranking
- [x] Rank Buyers button (violet) in buyer card header
- [x] Export Report button (emerald) in buyer card header - downloads PDF
- [x] Buyers auto-sorted by AI score (new buyers pinned top, then score, then status weight)

## Linked to Property Filter on Contacts (done)
- [x] Add linkedPropertyId filter to getContacts DB helper (subquery join)
- [x] Add linkedPropertyId to contacts.list tRPC input schema
- [x] Add property search combobox to Contacts page filter bar
- [x] Active filter badge with one-click clear
- [x] Empty state message explains how links are created

## AI Contact Auto-fill + Multi-email Support
- [x] Add contact_emails table for multiple emails per contact
- [x] Add contactEmails tRPC router (list, add, remove, setPrimary, detectFromThread)
- [x] AI-powered primary contact detection from email threads (LLM reasoning)
- [x] Email Studio: auto-fill contact picker from AI-detected primary contact in thread
- [x] AI Assistant: auto-fill contact picker when detected name matches existing contact with high confidence
- [x] ContactDetail: multi-email UI (show all emails, add new, set primary, remove, hover actions)

## Email Studio Voice & Flexibility Fix
- [x] Rewrite STYLE_PROMPT to be context-aware (intro vs operational vs deal update)
- [x] Add intro email example (Brandon/Ben intro) to style prompt
- [x] Add tone selector UI (Tight / Balanced / Conversational) before processing
- [x] Pass original draft into refinement chat so "make it like my original" works
- [x] Soften brevity rules to be preferences not absolutes

## Email Studio - Task Date Picker
- [x] Add dueDate field to CRMAction type (add_task actions)
- [x] Add date picker UI on each add_task suggested action card (calendar popover)
- [x] Pass dueDate when accepting the task action (createTask mutation)

## AI Contact Notes Refresh (Living Description)
- [x] Backend: refreshContactNotes procedure — takes contactId + new context string, reads current notes + recent activities, AI rewrites as a single short paragraph
- [x] Email Studio: call refreshContactNotes after "Update Contact" action is accepted (append new context from action detail)
- [x] AI Assistant: call refreshContactNotes after saving a call/email log (use AI summary as new context)
- [x] Listing Detail: call refreshContactNotes when a new buyer is added and that buyer is a known contact
- [ ] ContactDetail: show a subtle "Notes last refreshed" timestamp so user knows it was updated

## Listing Sellers & Sale Records
- [x] Schema: listing_sellers join table (listingId, contactId, role)
- [x] Schema: sale_records table (propertyId, listingId, closingDate, closingPrice, pricePerUnit, capRate, processNote)
- [x] DB helpers: getListingSellers, addListingSeller, removeListingSeller, createSaleRecord, getSaleRecord
- [x] tRPC procedures: listings.getSellers, listings.addSeller, listings.removeSeller, properties.createSaleRecord, properties.getSaleRecord
- [x] ListingDetail: Listing Sellers section (search + link contacts, show linked sellers with remove option)
- [x] ListingDetail: "Record Sale" button opens modal (closingDate, closingPrice, pricePerUnit auto-calc + editable, capRate, processNote)
- [x] PropertyDetail: Sale Record card (permanent history card showing closing details)
- [x] Email Studio: include seller contact names/info in AI context when listing is detected
- [x] AI Assistant: include seller contact names/info in AI context when listing is detected

## Contact Notes "Last Updated" Timestamp
- [x] Add notesUpdatedAt column to contacts schema and push migration
- [x] Update refreshNotes procedure to set notesUpdatedAt = now() when notes are rewritten
- [x] Show "Last updated [date]" below notes field on ContactDetail page

## Sale Record in AI Context + Off-Market Interest Fields
- [x] Schema: add offMarketInterest (boolean), offMarketConfidence (enum), offMarketTimeline (varchar), offMarketNotes (text) to properties table
- [x] Push migration
- [x] Backend: updateOffMarketInterest procedure on properties router
- [x] Backend: include saleRecord and offMarket fields in property context helpers
- [x] PropertyDetail: Off-Market Interest section (toggle, confidence dropdown, timeline, notes)
- [x] Email Studio: include saleRecord data in property context string for AI prompt
- [x] Email Studio: include offMarket interest fields in property context string
- [x] AI Assistant: include saleRecord and offMarket fields in prompt context

## Property Swap Control in AI Assistant & Email Studio
- [x] AI Assistant: add search-and-swap control next to detected property so user can correct it before saving
- [x] Email Studio: add search-and-swap control next to detected property in CRM action cards

## Fix update_listing Action in Email Studio
- [x] Extend CRMAction type with listingNotes field for deal notes/fee changes
- [x] Update AI prompt to extract listingNotes (fee changes, deal updates) into the action
- [x] Wire update_listing acceptance to call listings.update mutation (save stage + notes)
- [x] Show what was saved in the toast confirmation

## Broker Notes on Listing Detail
- [x] Show brokerNotes field on Listing Detail page (read + inline edit)
- [x] Allow manual editing/appending of broker notes directly on the listing

## Deal Activity Log on Listings
- [x] Schema: deal_activities table (id, listingId, userId, type, summary, createdAt)
- [x] Push migration
- [x] Backend: createDealActivity and getDealActivities helpers in db.ts
- [x] Backend: listings.createDealActivity and listings.dealActivities tRPC procedures
- [x] Frontend: Deal Activity section on Listing Detail below Broker Notes (chronological log)
- [x] AI Assistant: save deal activity on listing when note is linked to a listing
- [x] Email Studio: save deal activity when update_listing action is accepted

## Unsolicited Offer Log (Off-Market)
- [x] Schema: unsolicited_offers table (id, propertyId, userId, amount, buyerContactId, receivedAt, notes, createdAt)
- [x] Push migration
- [x] Backend: createUnsolicitedOffer, getUnsolicitedOffers, deleteUnsolicitedOffer helpers in db.ts
- [x] Backend: properties.createOffer, properties.offers, properties.deleteOffer tRPC procedures
- [x] Frontend: Unsolicited Offer Log section on PropertyDetail (add form, list, delete)
- [x] AI Assistant: detect offer amounts on off-market properties and suggest log_offer CRM action
- [x] Dashboard: surface off-market properties with recent unsolicited offer activity (last 30 days)

## Unsolicited Offer - Buyer Contact Picker
- [x] Replace buyer text input in Unsolicited Offer form with searchable contact picker (same style as AI Assistant contact search)

## AI Property Notes + Web Intelligence Card
- [x] Schema: add notesUpdatedAt (bigint) and webIntelligence (text) and webIntelligenceUpdatedAt (bigint) to properties table
- [x] Push migration
- [x] Backend: refreshPropertyNotes procedure — reads CRM data (owner, activities, offers, off-market interest), AI rewrites as short paragraph, saves notesUpdatedAt
- [x] Backend: getWebIntelligence procedure — web search on address + owner, AI synthesizes into structured sections (Ownership, Owner Profile, Permits, Sale History, News, Zoning, Market Context), saves result + timestamp
- [x] PropertyDetail: Notes card shows "Last updated" timestamp + Refresh button (triggers refreshPropertyNotes)
- [x] PropertyDetail: Collapsible Web Intelligence card below Notes — Search Web button, structured output with labeled sections, cached result shown if available
- [x] AI Assistant: auto-refresh property notes after saving a call log linked to a property
- [x] PropertyDetail: auto-refresh property notes after logging an unsolicited offer

## Manual AI Refresh on Contact Detail
- [x] Add AI Refresh button to Contact Notes card header (same style as Property Notes)
- [x] Button triggers contacts.refreshNotes mutation with contactId
- [x] Show loading spinner while refreshing, toast on success/error

## Email Studio: log_activity links to listing
- [x] In log_activity handler: resolve listingId from action.listingName (or overrideDealMentioned) and pass to createActivity
- [x] In log_activity handler: when a listing is resolved, auto-save a deal activity entry on that listing (type=note, summary from action.detail)

## UX Overhaul — Light Mode + Map + AI Tools + Roles

### Phase 1: Warm/Premium Light Mode
- [x] Update CSS variables in index.css to warm/premium light theme (cream bg, dark text, amber accent)
- [x] Switch ThemeProvider defaultTheme to light
- [x] Update sidebar, cards, and key UI components for light mode contrast
- [x] Update DashboardLayout for light mode

### Phase 2: Map Page Redesign
- [x] Redesign map sidebar — cleaner layout, property count summary, filter controls
- [x] Redesign property pins — color-coded by status (active listing, tracked off-market, recent sale)
- [x] Redesign property card popup on pin click — polished, client-ready
- [x] Add status legend to map

### Phase 3: Contact Role on Deal Links
- [x] Add role field to contactLinks schema (Buyer's Broker, Seller, Listing Agent, Property Manager, Attorney, Other)
- [x] Push migration
- [x] Surface role in contact link UI on listing and property pages
- [ ] Show role in AI context for coaching (next session)

### Phase 4: Deal Context Bar in AI Tools
- [x] Add listing swap control to AI Assistant Quick Log (detected listing card with Change button)
- [ ] Add Deal Context bar to Email Studio (unify with existing context detection)
- [ ] Unified save flow — one button writes to all relevant CRM records
- [x] Corrections persist to CRM immediately (override state flows into save)

## Map Pin Redesign + Rename Mixed→Other
- [x] Replace image-in-pin map markers with clean solid colored circle dots (no icons)
- [x] Color scheme: MHC=teal, Apartment=indigo, Affordable Housing=green, Self Storage=amber, Other=slate
- [x] Keep subtle drop shadow on dots for depth
- [x] Rename "mixed" property type to "other" in schema enum, migration, UI labels, filters, forms

## Role-Aware AI Deal Coach
- [x] Backend: getDealIntelligenceContext procedure — assembles contact history, deal role, listing stage, activity recency, buyer criteria, off-market interest, dual-role detection
- [x] Backend: inject deal intelligence context into Email Studio coaching prompt
- [x] Backend: inject deal intelligence context into AI Assistant analysis prompt
- [x] Coach surfaces: contact relationship depth, days since last contact, deal stage context, role-specific advice, buyer criteria match, dual-role flag (buyer who is also an owner)

## Add Owner Role to Contact Link Dropdown
- [x] Add "owner" to DEAL_ROLES in PropertyDetail.tsx
- [x] Add "owner" to DEAL_ROLES in ContactDetail.tsx
- [x] Add "owner" to dealRole enum in schema and push migration
- [x] Add "owner" to updateContactPropertyLinkRole input enum in contactLinks router

## Unified Owner Card on Property Detail
- [x] Owner Information card shows linked Owner contact's CRM data (name, phone, email, link to contact page) when a contact with role "Owner" is linked
- [x] "Create Contact from Owner" button on Owner card when flat owner data exists but no linked contact
- [x] Creating contact from Owner auto-links them to the property with role "Owner"
- [x] Fallback: flat editable fields still show when no linked owner contact exists

## Unified Owner System (single source of truth)
- [x] Import: after creating contact + setting ownerId, also create contactPropertyLink with dealRole="owner" and source="import"
- [x] Create Contact from Owner button: after creating link, also update property.ownerId to the new contact's id
- [x] Manual link creation: when dealRole="owner" is set on a new link, also update property.ownerId
- [x] Role change: when a link's dealRole is changed TO "owner", update property.ownerId; when changed AWAY from "owner", clear property.ownerId if it matched
- [x] Link deletion: when an owner-role link is deleted, clear property.ownerId
- [x] Map: getPropertiesForMap should join contactPropertyLinks to find owner contact (fallback to ownerId join) so newly linked owners show up
- [x] Existing imported data: on import upsert, if property already has ownerId but no owner contactPropertyLink, create the missing link (backfill)

## Data Cleanup — Duplicate Detection & Merge
- [ ] Backend: findDuplicateContacts query (match by name, email, phone)
- [ ] Backend: findDuplicateProperties query (match by geocode proximity or name+city)
- [ ] Backend: mergeContacts procedure (AI picks best fields, re-links all data)
- [ ] Backend: mergeProperties procedure (AI picks best fields, re-links all data)
- [ ] Backend: deleteContact procedure (hard delete with cascade)
- [ ] Backend: deleteProperty procedure (hard delete with cascade)
- [ ] Frontend: Data Cleanup page with Contacts and Properties tabs
- [ ] Frontend: Duplicate pair cards with side-by-side preview and Merge button
- [ ] Frontend: Add Data Cleanup to sidebar nav
- [ ] Frontend: Add Delete button to ContactDetail page
- [ ] Frontend: Add Delete button to PropertyDetail page

## importNotes Field on Properties
- [x] Schema: add importNotes text column to properties table, run pnpm db:push
- [x] Backend: update bulkImport to populate importNotes with date-header append logic
- [x] Backend: add comment to AI refreshPropertyNotes that importNotes is intentionally not touched
- [x] Frontend: add collapsible Research Notes (Import) card on PropertyDetail (read-only, muted bg)

## Expose importNotes in Import Properties Field Mapper
- [x] Add importNotes as a mappable CRM field in ImportProperties.tsx (label: "Research Notes (Import)")
- [x] Ensure buildImportRows passes importNotes through to the bulkImport mutation

## Data Export Page
- [x] Install jszip dependency
- [x] Backend: create server/routers/export.ts with raw, rich, and fullBackup procedures
- [x] Backend: register export router in server/routers/index.ts
- [x] Frontend: create client/src/pages/DataExport.tsx with three card sections
- [x] Frontend: add sidebar nav entry (Download icon, /export path)
- [x] Frontend: register /export route in App.tsx

## Call Prep Rebuild (Web Intelligence → Call Prep)
- [x] Backend: add DB helpers for nearby properties/listings, matching buyer criteria, recent comps in same city
- [x] Backend: rewrite webIntelligence procedure with 4-layer prompt and new output schema (relationship, nearbyActivity, marketIntel, talkingPoint)
- [x] Frontend: rename "Web Intelligence" card to "Call Prep" and render new sections
- [x] Frontend: update section labels and layout to match new output shape

## Call Prep Fixes
- [x] Fix Suggested Opening text color (amber-100 on amber bg is unreadable — use foreground color)
- [x] Improve Local Market Intel search queries to return more actionable results

## Last Sale Price & Date in PropertyDetail
- [x] Add Last Sale Price and Last Sale Date fields below Estimated Value in PropertyDetail.tsx (inline-editable, currency + date format)

## Market Intel Knowledge Base
- [x] Schema: add markets + market_intel tables, run db:push
- [x] Backend: markets router (list, tree, create, update, delete, seedDefaults, matchCity)
- [x] Backend: marketIntel router (list, getForProperty, create, update, delete, AI extraction)
- [x] Backend: update Call Prep to pull from market intel KB (web search as fallback)
- [x] Frontend: MarketConfig.tsx (collapsible tree, add/edit/delete, seed defaults)
- [x] Frontend: MarketIntel.tsx (add intel form with parent chain preview, intel list)
- [x] Frontend: sidebar entries + App.tsx routes for /markets and /market-intel

## Market Assignment on Properties
- [x] Schema: add marketId (int, nullable, FK to markets) to properties table; run pnpm db:push
- [x] Backend: add marketId to properties update/create procedures and db.ts helpers
- [x] Backend: update Call Prep to use property.marketId (direct lookup) instead of city name match
- [x] Frontend: add Market dropdown to PropertyDetail edit form (indented select, same as MarketIntel)
- [x] Frontend: show assigned market name as a display row in PropertyDetail

## Email Studio Market Intel Integration
- [x] Backend: add getMarketIntelForProperty tRPC query (fetches KB intel for a property's marketId with parent chain)
- [x] Frontend: fetch market intel when property is selected in Email Studio context bar
- [x] Frontend: inject market intel block into sendChatEdit prompt
- [x] Frontend: add market intel quick-action chips alongside coaching point chips
- [x] Frontend: detect question vs. edit intent and respond conversationally (no email rewrite) for questions

## Import Enriched File Fixes
- [x] Add camelCase column header aliases to COLUMN_MAP in ImportEnriched.tsx
- [x] Add importNotes and market fields to EnrichedRow type
- [x] Backend: update bulkImportEnriched to accept importNotes and resolve market name to marketId
- [x] Frontend: wire importNotes and market through parseRow and import mutation

## City Fallback Market Matching
- [x] Update enrichedImport: if market column has no match, fall back to city field for market lookup

## Batched Import Rebuild
- [x] Clear partial import data (properties, contacts, activities, links)
- [x] Rebuild ImportEnriched.tsx to send rows in batches of 50 with real progress bar
- [x] Ensure contact deduplication cache persists across batches (server-side or name-based skip)

## Contacts Page Pagination
- [x] Fix Contacts page default limit from 100 to 200, add "Load more" button (+200 per click)
- [x] Show "+" suffix on count when more records may exist beyond current limit

## Import Notes (Research Notes) Bug
- [x] Diagnose why importNotes column is not being saved during enriched import
- [x] Fix the importNotes mapping/storage issue
- [x] Confirmed: 2621/2623 properties have importNotes saved; card is collapsed by default (click to expand)

## Listing Deal Activity - Show All Property Activity
- [x] Diagnose how listing deal activity query works vs how property activities are stored
- [x] Update listing deal activity to include ALL activities linked to the listing's property (not just listing-specific ones)
- [x] Ensure AI Assistant and Email Studio logged activities appear under the listing's Deal Activity section

## Add Listing - Searchable Property Selector
- [x] Find the Add Listing form and property dropdown
- [x] Replace property Select dropdown with a searchable combobox (type to filter by name/address)

## Map Performance & UX Fixes
- [x] Fix map slowness when panning/zooming with 2,600+ markers (use MarkerClusterer, clusters below zoom 11)
- [x] Fix property detail card covering the selected pin (moved card to bottom-right corner)

## Map - Highlight Selected Pin
- [x] Visually highlight the active/selected map pin (larger, white ring, elevated z-index, pulsing ring)
- [x] Restore normal style when a different pin is selected or card is closed

## Email Studio - Strip Markdown from Drafts
- [x] Find where AI email draft content is generated/rendered (outreach generator + email editor in ai.ts)
- [x] Strip markdown symbols (*, **, #, bullet dashes) so drafts return as plain text (stripMarkdown helper + updated prompts)

## Map - Property Name Label on Selected Pin
- [x] Show a small text bubble with the property name beneath the active/selected pin
- [x] Remove the label when the pin is deselected or a different pin is clicked

## Email Markdown Stars - Still Appearing (Round 2)
- [x] Audit ALL AI procedures that produce email/message text for missing stripMarkdown coverage
- [x] Fixed: STYLE_PROMPT in EmailStudio.tsx still had bullet instructions; iterative chat edit path was not stripping; added client-side stripMarkdown + updated prompts

## AI Tasks - No Weekend Due Dates
- [x] Add nextWeekday() helper that bumps Saturday/Sunday to Monday
- [x] Applied to all AI task due date paths: applyCallActions (server), Tasks.tsx follow-up suggestion, AIAssistant.tsx task cards

## Email/Password Login (Simple Auth)
- [x] Audit current auth setup (OAuth flow, JWT session, context)
- [x] Add /api/auth/password-login endpoint that checks email+password env vars and issues a JWT session cookie
- [x] Add a simple login page UI that replaces the OAuth redirect
- [x] Set credentials via secrets (ADMIN_EMAIL, ADMIN_PASSWORD_HASH)
- [x] Test login flow end-to-end (74 tests passing)

## Cmd+F / Ctrl+F Opens Global Search
- [x] Add keyboard shortcut that intercepts Cmd+F / Ctrl+F and focuses the GlobalSearch bar

## Password Login - Fix User Identity
- [x] Password login creates a synthetic "admin" user instead of logging in as the existing owner account
- [x] Fixed: now uses OWNER_OPEN_ID env var to issue session token for the real owner user (Chriskott Todd)

## Map - Focus Property on Navigation from PropertyDetail
- [x] When clicking "View on Map" from a property, pass lat/lng + propertyId in URL params
- [x] MapView reads those params on load, centers + zooms to neighborhood level (zoom 14), opens the property card

## Mobile Responsiveness Fixes (iPhone 375px-430px)
- [x] Sidebar: solid background, proper z-index, readable text, auto-close on nav item tap
- [x] Map View: collapsible filter bar (collapsed by default), full-screen map on mobile
- [x] Contact Detail: stack avatar/name/status vertically, full-width action buttons row, no overflow
- [x] Properties list: hide Geocode button on mobile, scrollable action bar, full-width sliders with 44px touch targets
- [x] Properties table: column headers aligned via overflow-x scroll; sliders now full-width on mobile
- [x] All action button touch targets set to min-h-[44px] on mobile per Apple HIG

## Properties Table Mobile Overlap Fix
- [x] Fix Est. Value / Owner / Year Built columns overlapping on mobile
- [x] Switched to card-row layout on mobile (< sm): Name + City/County on left, Status+Type badges + units/year on right
- [x] Full 10-column table still shows on desktop (>= sm)

## Listings Tab - Total Value Not Centered on Mobile
- [x] Fixed: stats grid was grid-cols-3 on all sizes; changed to grid-cols-1 on mobile, sm:grid-cols-3 on desktop so each card is full-width and properly centered on iPhone

## Contact Resolution Rebuild (Email Studio + AI Assistant)
- [x] Audit current contact lookup in Email Studio and AI Assistant
- [x] Build resolveContact backend: email exact match → name+property → full name → most-recently-interacted fallback
- [x] Build ContactConfirmationCard UI: name, company, role, last activity, linked properties, swap button
- [x] Wire card into Email Studio: show after contact is resolved, refresh AI context on swap
- [x] Wire card into AI Assistant: show after contact is resolved, refresh AI context on swap
- [x] Recency fallback: when no match found, pre-select most recently contacted contact with "Most recent" badge
- [x] selectionReason badges: Email match (green), Name match (blue), Most recent (amber), Manual (none)

## PWA Support
- [x] Install vite-plugin-pwa and workbox
- [x] Generate 192x192 and 512x512 branded icons (deep espresso + amber building)
- [x] Configure manifest (name: RE CRM, short_name: RE CRM, theme_color: #1e1a15, display: standalone, start_url: /, scope: /)
- [x] Configure service worker with app shell precaching (globPatterns js/css/html) + NetworkFirst for tRPC + CacheFirst for CDN
- [x] Upload icons to CDN, wire into manifest with maskable variant
- [x] Add apple-touch-icon, theme-color, apple-mobile-web-app meta tags to index.html
- [x] Add useRegisterSW hook for auto-update handling
- [x] Verified: manifest served at /manifest.webmanifest, SW injected, all meta tags present

## iOS Safari Login Fix
- [x] Diagnose Safari ITP cookie blocking on chriskottcrm.manus.space
- [x] Fix cookies.ts: SameSite=Lax (was None) + always secure=true on non-localhost
- [x] Fix passwordAuth.ts: derive stable openId from admin email when OWNER_OPEN_ID is missing
- [x] Fix db.ts: guard ownerOpenId check against empty string
- [ ] Verify login works on iOS Safari (PWA home screen mode) — needs user test after publish

## CRM Import Flow Rebuild (AI Assistant + Email Studio)
- [x] Fix: ContactSearchPicker create form now captures email + isOwner/isBuyer flags
- [x] Fix: fuzzy property matching in AI Assistant (contains/partial match, all 3 locations)
- [x] Fix: fuzzy listing matching in AI Assistant (contains/partial match, all 3 locations)
- [x] Fix: fuzzy property matching in Email Studio (contains/partial match, all 5 locations)
- [x] Fix: fuzzy listing matching in Email Studio (contains/partial match, all 4 locations)
- [x] Fix: AI Assistant buyer card always visible when contact linked (collapsed by default, pre-selects detected listing)
- [x] Fix: Email Studio buyer card always visible when contact resolved (collapsed by default, pre-selects detected listing)
- [x] Fix: buyer interest save calls upsertBuyerInterest → logs contact to listing page Buyers tab

## Contact Resolution Fix (Strict Matching Only)
- [x] Remove recency fallback from AI Assistant (was pre-selecting most recent contact when no match found)
- [x] Remove recency fallback from Email Studio
- [x] AI Assistant: strict email match OR exact full-name (first+last) match only (score >= 90)
- [x] Email Studio: strict email match OR exact full-name (first+last) match only (score >= 90)
- [x] On no match: show not_found state with pre-filled name/email from AI detection in search box
- [x] fuzzyMatch function in Email Studio: removed ambiguous state, only returns found (score>=90) or not_found

## Wrong Person? → Create New Contact Fix
- [ ] AI Assistant: ensure ContactSearchPicker opened from "Wrong person?" has allowCreate=true and pre-fills detected name/email
- [ ] Email Studio: same fix — allowCreate=true in the swap picker path
- [ ] Verify create form captures email + isOwner/isBuyer flags in both tools

## CRM UX Spec Implementation (from Claude review)
- [x] P1A: ContactConfirmationCard — "Create new contact" button always visible outside scroll area
- [x] P1A: ContactConfirmationCard — add detectedCompany and detectedPhone props
- [x] P1A: ContactConfirmationCard — add phone field to create form
- [x] P1A: ContactConfirmationCard — add matchDetail prop for match quality display
- [x] P1B: ContactSearchPicker — add defaultEmail, defaultCompany, defaultPhone props to pre-fill create form
- [x] P1C: AI Assistant QuickLog — replace toggle/batch-save with Accept/Skip per-card pattern
- [x] P1C: AI Assistant QuickLog — each Accept writes to DB immediately (no batch save button)
- [x] P1D: AI Assistant QuickLog — Deal Intelligence no longer auto-loads; on-demand button only
- [x] P1E: Email Studio — Deal Intelligence no longer auto-loads on contact match
- [x] P1E: Email Studio — "Load Deal Intelligence" on-demand button added
- [x] P1E: Email Studio — detectedCompany and detectedPhone passed to ContactConfirmationCard
- [x] P2A: Email Studio — Buyer Interest card always visible (not gated on resolvedContactId)
- [x] P2B: Backend detectFromThread — senderEmail used for email-first lookup before AI call
- [x] P2C: Email Studio — redundant "Not in CRM?" create form removed (ContactConfirmationCard handles it)
- [x] P2C: ContactConfirmationCard — notFoundMode prop added (skips confirmed display, shows create/search)
- [x] P3A: AI Assistant QuickLog — layout changed from 2-column grid to single centered column (max-w-2xl)
- [x] P3B: AI Assistant QuickLog — context summary bar replaces full Summary card
- [x] P3C: AI Assistant QuickLog — property and listing cards compacted to one-line rows

## UX Polish - Pending Tasks & Property Rows
- [x] Email Studio: align Pending Tasks card to match AI Assistant's compact card style
- [x] AI Assistant: add X/remove button to auto-populated property compact row (clear auto-fill if wrong)
- [x] AI Assistant: add X/remove button to auto-populated listing compact row (clear auto-fill if wrong)
- [x] Email Studio: add X/remove button to auto-populated property row in Column 2
- [x] Email Studio: add X/remove button to auto-populated listing row in Column 2
