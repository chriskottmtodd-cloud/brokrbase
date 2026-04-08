import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { join } from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────
const DB_URL = 'mysql://root@localhost:3306/re_crm';
const CSV_DIR = '/Users/chriskotttodd/Desktop/Manus CRM/crm_backup_2026-04-04';
const BATCH_SIZE = 150;
const DEFAULT_USER_ID = 1;

// ─── CSV Parser (handles quoted fields with commas and newlines) ─────────────
function parseCSV(text) {
  const rows = [];
  let headers = null;
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Look ahead: doubled quote = escaped quote
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      currentField += ch;
      i++;
    } else {
      if (ch === '"' && currentField.length === 0) {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        currentRow.push(currentField);
        currentField = '';
        if (ch === '\r') i++; // skip \r
        i++; // skip \n

        if (!headers) {
          headers = currentRow;
        } else if (currentRow.length > 0) {
          // Build object from row
          const obj = {};
          for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = currentRow[j] !== undefined ? currentRow[j] : '';
          }
          rows.push(obj);
        }
        currentRow = [];
      } else {
        currentField += ch;
        i++;
      }
    }
  }

  // Handle last row (no trailing newline)
  if (currentRow.length > 0 || currentField.length > 0) {
    currentRow.push(currentField);
    if (!headers) {
      headers = currentRow;
    } else {
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = currentRow[j] !== undefined ? currentRow[j] : '';
      }
      rows.push(obj);
    }
  }

  return { headers, rows };
}

// ─── Date parser ─────────────────────────────────────────────────────────────
// CSV dates look like: "Thu Mar 12 2026 17:21:25 GMT+0000 (Coordinated Universal Time)"
function parseDate(val) {
  if (!val || val.trim() === '') return null;
  const str = val.trim();
  // Strip the "(Coordinated Universal Time)" or similar parenthetical
  const cleaned = str.replace(/\s*\(.*\)\s*$/, '').trim();
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return null;
  // Format as MySQL DATETIME: YYYY-MM-DD HH:MM:SS
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// ─── Value helpers ───────────────────────────────────────────────────────────
function toNull(val) {
  if (val === undefined || val === null || val === '') return null;
  return val;
}

function toInt(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function toFloat(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function toBool(val) {
  if (val === undefined || val === null || val === '') return false;
  if (val === 'true' || val === '1' || val === true) return true;
  return false;
}

// ─── Read CSV file ───────────────────────────────────────────────────────────
function readCSV(filename) {
  const filepath = join(CSV_DIR, filename);
  const text = readFileSync(filepath, 'utf-8');
  return parseCSV(text);
}

// ─── Batch insert helper ─────────────────────────────────────────────────────
async function batchInsert(conn, table, columns, rows, batchSize = BATCH_SIZE) {
  if (rows.length === 0) {
    console.log(`  [${table}] No rows to insert.`);
    return 0;
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const placeholders = batch.map(
      () => `(${columns.map(() => '?').join(',')})`
    ).join(',');
    const values = batch.flat();
    const sql = `INSERT INTO \`${table}\` (${columns.map(c => '`' + c + '`').join(',')}) VALUES ${placeholders}`;

    try {
      const [result] = await conn.query(sql, values);
      inserted += result.affectedRows;
    } catch (err) {
      // On batch failure, try one-by-one to identify bad rows
      console.error(`  [${table}] Batch error at offset ${i}: ${err.message}`);
      console.log(`  [${table}] Retrying row-by-row for this batch...`);
      for (let j = 0; j < batch.length; j++) {
        const singleSql = `INSERT INTO \`${table}\` (${columns.map(c => '`' + c + '`').join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
        try {
          const [r] = await conn.query(singleSql, batch[j]);
          inserted += r.affectedRows;
        } catch (rowErr) {
          const rowIdx = i + j;
          console.error(`  [${table}] Row ${rowIdx} FAILED: ${rowErr.message}`);
        }
      }
    }

    if ((i + batchSize) % 500 === 0 || i + batchSize >= rows.length) {
      console.log(`  [${table}] ${Math.min(i + batchSize, rows.length)}/${rows.length} processed`);
    }
  }
  console.log(`  [${table}] Inserted ${inserted} rows total.`);
  return inserted;
}

// ─── Main import ─────────────────────────────────────────────────────────────
async function main() {
  console.log('Connecting to database...');
  const conn = await mysql.createConnection(DB_URL);
  console.log('Connected.\n');

  // Disable FK checks for clean import
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  await conn.query('SET SESSION sql_mode = ""'); // lenient mode for enum values

  try {
    // ── 1. Create default user ──────────────────────────────────────────
    console.log('=== Creating default user ===');
    await conn.query(`DELETE FROM users WHERE id = ?`, [DEFAULT_USER_ID]);
    await conn.query(
      `INSERT INTO users (id, openId, name, email, loginMethod, role) VALUES (?, ?, ?, ?, ?, ?)`,
      [DEFAULT_USER_ID, 'import-default-user', 'Chriskott Todd', 'chriskottmtodd@gmail.com', 'import', 'admin']
    );
    console.log('  Created user id=1 "Chriskott Todd"\n');

    // ── 2. Contacts ─────────────────────────────────────────────────────
    console.log('=== Importing contacts ===');
    const contactsCSV = readCSV('contacts.csv');
    console.log(`  Read ${contactsCSV.rows.length} rows from contacts.csv`);

    const contactColumns = [
      'id', 'userId', 'firstName', 'lastName', 'email', 'phone', 'company',
      'isOwner', 'isBuyer', 'buyerType', 'address', 'city', 'state', 'zip',
      'priority', 'notes', 'ownerNotes', 'tags',
      'lastContactedAt', 'nextFollowUpAt', 'snoozedUntil', 'createdAt', 'updatedAt'
    ];
    const contactRows = contactsCSV.rows.map(r => [
      toInt(r.id),
      DEFAULT_USER_ID,
      toNull(r.firstName) || '',
      toNull(r.lastName) || '',
      toNull(r.email),
      toNull(r.phone),
      toNull(r.company),
      toBool(r.isOwner),
      toBool(r.isBuyer),
      toNull(r.buyerType),
      toNull(r.address),
      toNull(r.city),
      toNull(r.state),
      toNull(r.zip),
      toNull(r.priority) || 'warm',
      toNull(r.notes),
      toNull(r.ownerNotes),
      toNull(r.tags),
      parseDate(r.lastContactedAt),
      parseDate(r.nextFollowUpAt),
      parseDate(r.snoozedUntil),
      parseDate(r.createdAt) || parseDate(new Date().toUTCString()),
      parseDate(r.updatedAt) || parseDate(new Date().toUTCString()),
    ]);
    await batchInsert(conn, 'contacts', contactColumns, contactRows);
    console.log('');

    // ── 3. Properties ───────────────────────────────────────────────────
    console.log('=== Importing properties ===');
    const propsCSV = readCSV('properties.csv');
    console.log(`  Read ${propsCSV.rows.length} rows from properties.csv`);

    const propColumns = [
      'id', 'userId', 'name', 'propertyType', 'address', 'city', 'state', 'zip', 'county',
      'unitCount', 'vintageYear', 'sizeSqft', 'lotAcres',
      'estimatedValue', 'lastSalePrice', 'lastSaleDate', 'askingPrice', 'capRate', 'noi',
      'status', 'ownerId', 'ownerName', 'ownerCompany', 'ownerPhone', 'ownerEmail',
      'latitude', 'longitude', 'isMyListing', 'offMarketInterest',
      'offMarketConfidence', 'offMarketTimeline', 'offMarketNotes',
      'notes', 'importNotes', 'tags', 'lastContactedAt', 'nextFollowUpAt',
      'createdAt', 'updatedAt'
    ];
    const propRows = propsCSV.rows.map(r => [
      toInt(r.id),
      DEFAULT_USER_ID,
      toNull(r.name) || 'Unknown',
      toNull(r.propertyType) || 'other',
      toNull(r.address),
      toNull(r.city),
      toNull(r.state),
      toNull(r.zip),
      toNull(r.county),
      toInt(r.unitCount),
      toInt(r.vintageYear),
      toInt(r.sizeSqft),
      toFloat(r.lotAcres),
      toFloat(r.estimatedValue),
      toFloat(r.lastSalePrice),
      parseDate(r.lastSaleDate),
      toFloat(r.askingPrice),
      toFloat(r.capRate),
      toFloat(r.noi),
      toNull(r.status) || 'researching',
      toInt(r.ownerId),
      toNull(r.ownerName),
      toNull(r.ownerCompany),
      toNull(r.ownerPhone),
      toNull(r.ownerEmail),
      toFloat(r.latitude),
      toFloat(r.longitude),
      toBool(r.isMyListing),
      toBool(r.offMarketInterest),
      toNull(r.offMarketConfidence),
      toNull(r.offMarketTimeline),
      toNull(r.offMarketNotes),
      toNull(r.notes),
      toNull(r.importNotes),
      toNull(r.tags),
      parseDate(r.lastContactedAt),
      parseDate(r.nextFollowUpAt),
      parseDate(r.createdAt) || parseDate(new Date().toUTCString()),
      parseDate(r.updatedAt) || parseDate(new Date().toUTCString()),
    ]);

    // Properties have a unique index on (userId, address, city, zip).
    // Some properties may share the same address — drop the unique index temporarily and recreate later,
    // or just handle duplicates by inserting with ON DUPLICATE KEY UPDATE.
    // We'll use INSERT IGNORE to skip duplicates.
    // Actually let's just do a normal insert since we disabled FK checks and we want all rows.
    // The unique index could cause issues — let's drop and recreate.
    try {
      await conn.query('ALTER TABLE `properties` DROP INDEX `prop_addr_uniq`');
      console.log('  Dropped unique address index temporarily');
    } catch (e) {
      // Index may not exist
    }

    await batchInsert(conn, 'properties', propColumns, propRows);

    // Recreate unique index (allow failures for dupes)
    try {
      await conn.query('ALTER TABLE `properties` ADD UNIQUE INDEX `prop_addr_uniq` (`userId`, `address`, `city`, `zip`)');
      console.log('  Recreated unique address index');
    } catch (e) {
      console.log('  Warning: Could not recreate unique address index (duplicates exist). Skipping.');
    }
    console.log('');

    // ── 4. Listings ─────────────────────────────────────────────────────
    console.log('=== Importing listings ===');
    const listingsCSV = readCSV('listings.csv');
    console.log(`  Read ${listingsCSV.rows.length} rows from listings.csv`);

    const listingColumns = [
      'id', 'userId', 'propertyId', 'title', 'description',
      'askingPrice', 'capRate', 'noi', 'stage', 'status',
      'unitCount', 'propertyName', 'listedAt', 'closedAt', 'sellerId',
      'brokerNotes', 'marketingMemo', 'createdAt', 'updatedAt'
    ];
    const listingRows = listingsCSV.rows.map(r => [
      toInt(r.id),
      DEFAULT_USER_ID,
      toInt(r.propertyId),
      toNull(r.title) || 'Untitled',
      toNull(r.description),
      toFloat(r.askingPrice),
      toFloat(r.capRate),
      toFloat(r.noi),
      toNull(r.stage) || 'active',
      toNull(r.status) || 'active',
      toInt(r.unitCount),
      toNull(r.propertyName),
      parseDate(r.listedAt),
      parseDate(r.closedAt),
      toInt(r.sellerId),
      toNull(r.brokerNotes),
      toNull(r.marketingMemo),
      parseDate(r.createdAt) || parseDate(new Date().toUTCString()),
      parseDate(r.updatedAt) || parseDate(new Date().toUTCString()),
    ]);
    await batchInsert(conn, 'listings', listingColumns, listingRows);
    console.log('');

    // ── 5. Contact-Property Links ───────────────────────────────────────
    console.log('=== Importing contact_property_links ===');
    const cplCSV = readCSV('contact_property_links.csv');
    console.log(`  Read ${cplCSV.rows.length} rows from contact_property_links.csv`);

    const cplColumns = [
      'id', 'userId', 'contactId', 'propertyId', 'listingId',
      'dealRole', 'source', 'label', 'createdAt'
    ];
    const cplRows = cplCSV.rows.map(r => [
      toInt(r.id),
      DEFAULT_USER_ID,
      toInt(r.contactId),
      toInt(r.propertyId),
      toInt(r.listingId),
      toNull(r.dealRole),
      toNull(r.source) || 'manual',
      toNull(r.label),
      parseDate(r.createdAt) || parseDate(new Date().toUTCString()),
    ]);
    await batchInsert(conn, 'contact_property_links', cplColumns, cplRows);
    console.log('');

    // ── 6. Activities ───────────────────────────────────────────────────
    console.log('=== Importing activities ===');
    const activitiesCSV = readCSV('activities.csv');
    console.log(`  Read ${activitiesCSV.rows.length} rows from activities.csv`);

    // CSV has: id, contactId, propertyId, listingId, type, subject, summary, notes, outcome, occurredAt, createdAt
    // DB also has: userId, direction, duration, updatedAt
    const actColumns = [
      'id', 'userId', 'type', 'contactId', 'propertyId', 'listingId',
      'subject', 'summary', 'notes', 'outcome',
      'occurredAt', 'createdAt', 'updatedAt'
    ];
    const actRows = activitiesCSV.rows.map(r => [
      toInt(r.id),
      DEFAULT_USER_ID,
      toNull(r.type) || 'note',
      toInt(r.contactId),
      toInt(r.propertyId),
      toInt(r.listingId),
      toNull(r.subject),
      toNull(r.summary),
      toNull(r.notes),
      toNull(r.outcome),
      parseDate(r.occurredAt) || parseDate(r.createdAt) || parseDate(new Date().toUTCString()),
      parseDate(r.createdAt) || parseDate(new Date().toUTCString()),
      parseDate(r.createdAt) || parseDate(new Date().toUTCString()),
    ]);
    await batchInsert(conn, 'activities', actColumns, actRows);
    console.log('');

    // ── 7. Tasks ────────────────────────────────────────────────────────
    console.log('=== Importing tasks ===');
    const tasksCSV = readCSV('tasks.csv');
    console.log(`  Read ${tasksCSV.rows.length} rows from tasks.csv`);

    // CSV: id, title, description, type, priority, status, dueAt, completedAt, contactId, propertyId, listingId, createdAt, updatedAt
    const taskColumns = [
      'id', 'userId', 'title', 'description', 'type', 'priority', 'status',
      'dueAt', 'completedAt', 'contactId', 'propertyId', 'listingId',
      'createdAt', 'updatedAt'
    ];
    const taskRows = tasksCSV.rows.map(r => [
      toInt(r.id),
      DEFAULT_USER_ID,
      toNull(r.title) || 'Untitled Task',
      toNull(r.description),
      toNull(r.type) || 'follow_up',
      toNull(r.priority) || 'medium',
      toNull(r.status) || 'pending',
      parseDate(r.dueAt),
      parseDate(r.completedAt),
      toInt(r.contactId),
      toInt(r.propertyId),
      toInt(r.listingId),
      parseDate(r.createdAt) || parseDate(new Date().toUTCString()),
      parseDate(r.updatedAt) || parseDate(new Date().toUTCString()),
    ]);
    await batchInsert(conn, 'tasks', taskColumns, taskRows);
    console.log('');

    // ── 8. Unsolicited Offers ───────────────────────────────────────────
    console.log('=== Importing unsolicited_offers ===');
    const offersCSV = readCSV('unsolicited_offers.csv');
    console.log(`  Read ${offersCSV.rows.length} rows from unsolicited_offers.csv`);

    // CSV: id, propertyId, buyerContactId, amount, receivedAt, notes, createdAt
    const offerColumns = [
      'id', 'propertyId', 'userId', 'amount', 'buyerContactId',
      'receivedAt', 'notes', 'createdAt'
    ];
    const offerRows = offersCSV.rows.map(r => [
      toInt(r.id),
      toInt(r.propertyId),
      DEFAULT_USER_ID,
      toFloat(r.amount),
      toInt(r.buyerContactId),
      parseDate(r.receivedAt) || parseDate(new Date().toUTCString()),
      toNull(r.notes),
      parseDate(r.createdAt) || parseDate(new Date().toUTCString()),
    ]);
    await batchInsert(conn, 'unsolicited_offers', offerColumns, offerRows);
    console.log('');

    // ── Done ────────────────────────────────────────────────────────────
    console.log('=== Import complete! ===');

    // Print summary counts
    const tables = ['users', 'contacts', 'properties', 'listings', 'contact_property_links', 'activities', 'tasks', 'unsolicited_offers'];
    for (const t of tables) {
      const [[row]] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${t}\``);
      console.log(`  ${t}: ${row.cnt} rows`);
    }

  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    await conn.end();
    console.log('\nConnection closed.');
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
