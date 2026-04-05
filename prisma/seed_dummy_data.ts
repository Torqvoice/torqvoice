import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes, scryptSync } from "node:crypto";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";

// Matches better-auth's scrypt params — output is byte-compatible with its hashPassword,
// so the stored hash is verifiable by better-auth at sign-in time.
function hashPassword(password: string): string {
  const N = 16384, r = 16, p = 1, dkLen = 64;
  const maxmem = 128 * N * r * 2;
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password.normalize("NFKC"), salt, dkLen, { N, r, p, maxmem });
  return `${salt}:${key.toString("hex")}`;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const USER_ID = "IqcAL6GKoedJNO8Xi6UJkCM5YZqgS9uU";
const ORG_ID = "cmmh0vczm0000oiyan37vuyqf";
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || "demo@torqvoice.com";
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || "demo";
const DEMO_ORG_NAME = process.env.DEMO_ORG_NAME || "Demo Auto Workshop";
const DATA_ROOT = process.env.DATA_ROOT || path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(DATA_ROOT, "uploads", ORG_ID, "vehicles");

// All CDN URLs verified: extracted from Unsplash photo pages via curl, all return HTTP 200
const vehicleImages: Record<string, string> = {
  // Cars
  "toyota-camry.jpg": "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800&q=80",
  "ford-f150-white.jpg": "https://images.unsplash.com/photo-1605152322346-bd2391778772?w=800&q=80",
  "ford-f150-grey.jpg": "https://images.unsplash.com/photo-1614218110929-caa460524fc1?w=800&q=80",
  "ford-f150-black.jpg": "https://images.unsplash.com/photo-1691809158613-1e4d51ad086f?w=800&q=80",
  "bmw-3series.jpg": "https://images.unsplash.com/photo-1629994562870-75d504fc02a1?w=800&q=80",
  "honda-civic.jpg": "https://images.unsplash.com/photo-1636915873177-a0c1a48d84eb?w=800&q=80",
  "tesla-model3.jpg": "https://images.unsplash.com/photo-1610470832703-95d40c3fad55?w=800&q=80",
  "tesla-modely.jpg": "https://images.unsplash.com/photo-1504507926084-34cf0b939964?w=800&q=80",
  "chevy-silverado.jpg": "https://images.unsplash.com/photo-1601919652576-41bad7c8ccbd?w=800&q=80",
  "mercedes-sprinter.jpg": "https://images.unsplash.com/photo-1535655685871-dc8158ff167e?w=800&q=80",
  "audi-a4.jpg": "https://images.unsplash.com/photo-1619732569416-83a8adfd8ac4?w=800&q=80",
  "jeep-wrangler.jpg": "https://images.unsplash.com/photo-1579097647275-16b002cced9e?w=800&q=80",
  "jeep-wrangler-orange.jpg": "https://images.unsplash.com/photo-1622364631585-831e11682a67?w=800&q=80",
  "porsche-911.jpg": "https://images.unsplash.com/photo-1624880056652-c7993c99190f?w=800&q=80",
  "vw-golf-gti-red.jpg": "https://images.unsplash.com/photo-1560282105-222992ffb774?w=800&q=80",
  "vw-golf-gti-grey.jpg": "https://images.unsplash.com/photo-1746184842826-73fd144a4587?w=800&q=80",
  "ram-1500.jpg": "https://images.unsplash.com/photo-1649793395985-967862a3b73f?w=800&q=80",
  "ram-1500-black.jpg": "https://images.unsplash.com/photo-1678492861610-0bd650a846fe?w=800&q=80",
  "toyota-tacoma.jpg": "https://images.unsplash.com/photo-1509510779868-337c9f58ad54?w=800&q=80",
  "subaru-outback.jpg": "https://images.unsplash.com/photo-1681680061152-d3fc0b999a8e?w=800&q=80",
  "subaru-forester.jpg": "https://images.unsplash.com/photo-1687048988997-ec57f83ea3bd?w=800&q=80",
  // Trucks
  "kenworth-t680.jpg": "https://images.unsplash.com/photo-1586191552066-d52dd1e3af86?w=800&q=80",
  "freightliner-cascadia.jpg": "https://images.unsplash.com/photo-1635681463939-dc861a9a42c9?w=800&q=80",
  "volvo-fh640.jpg": "https://images.unsplash.com/photo-1633966100013-25a16d17b43d?w=800&q=80",
  "mack-granite.jpg": "https://images.unsplash.com/photo-1746349086423-06ea6b4d73f7?w=800&q=80",
  "concrete-mixer.jpg": "https://images.unsplash.com/photo-1530139675202-8c52bb810762?w=800&q=80",
  "dump-truck.jpg": "https://images.unsplash.com/photo-1686945127938-0296f10937ed?w=800&q=80",
  // Tractors
  "john-deere-6r.jpg": "https://images.unsplash.com/photo-1604923757148-f6e6957199c3?w=800&q=80",
  "fendt-942.jpg": "https://images.unsplash.com/photo-1629818572083-3ceb38e34322?w=800&q=80",
  "massey-ferguson.jpg": "https://images.unsplash.com/photo-1635351461882-9ffff1ce323c?w=800&q=80",
  "tractor-wheat.jpg": "https://images.unsplash.com/photo-1720273071277-190dd8f0a05a?w=800&q=80",
  "tractor-field.jpg": "https://images.unsplash.com/photo-1633554587766-ffc8151e31c0?w=800&q=80",
  "combine-harvester.jpg": "https://images.unsplash.com/photo-1754893889385-6c5a2d675524?w=800&q=80",
  "combine-jd.jpg": "https://images.unsplash.com/photo-1635174815612-fd9636f70146?w=800&q=80",
  // Heavy Machinery
  "cat-d6-bulldozer.jpg": "https://images.unsplash.com/photo-1621922688758-359fc864071e?w=800&q=80",
  "bulldozer-rocks.jpg": "https://images.unsplash.com/photo-1710669430606-30a8ceeb6e71?w=800&q=80",
  "komatsu-excavator.jpg": "https://images.unsplash.com/photo-1649807533255-bbc9c9fb7d77?w=800&q=80",
  "excavator-soil.jpg": "https://images.unsplash.com/photo-1622082679766-c5912d9416eb?w=800&q=80",
  "volvo-ec220e.jpg": "https://images.unsplash.com/photo-1568678453977-a90de6812e7a?w=800&q=80",
  "mini-excavator.jpg": "https://images.unsplash.com/photo-1722925837890-0fa0f0c9a356?w=800&q=80",
  "wheel-loader.jpg": "https://images.unsplash.com/photo-1630288214032-2c4cc2c080ca?w=800&q=80",
  "bulldozer-road.jpg": "https://images.unsplash.com/photo-1684431438566-6ff4a0df9190?w=800&q=80",
  "loader-field.jpg": "https://images.unsplash.com/photo-1727863526509-7670e063f308?w=800&q=80",
  "liebherr-crane.jpg": "https://images.unsplash.com/photo-1685305934074-3a7c37614c29?w=800&q=80",
  "crane-yellow.jpg": "https://images.unsplash.com/photo-1725882176928-de328f0d485a?w=800&q=80",
  "forklift.jpg": "https://images.unsplash.com/photo-1740914994657-f1cdffdc418e?w=800&q=80",
};

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const follow = (u: string, r = 0) => {
      if (r > 5) return reject(new Error("Too many redirects"));
      const mod = u.startsWith("https") ? https : http;
      mod.get(u, { headers: { "User-Agent": "Seed/1.0" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return follow(res.headers.location, r + 1);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const f = fs.createWriteStream(dest);
        res.pipe(f);
        f.on("finish", () => { f.close(); resolve(); });
        f.on("error", (e) => { fs.unlinkSync(dest); reject(e); });
      }).on("error", reject);
    };
    follow(url);
  });
}

function img(cat: string, file: string) { return `/api/files/${ORG_ID}/${cat}/${file}`; }

async function provisionDemoAccount() {
  console.log("Provisioning demo user + organization...");

  // Owner user (idempotent — safe to re-run)
  await prisma.user.upsert({
    where: { id: USER_ID },
    create: {
      id: USER_ID,
      email: DEMO_EMAIL,
      name: "Demo Owner",
      emailVerified: true,
      termsAcceptedAt: new Date(),
    },
    update: { email: DEMO_EMAIL, name: "Demo Owner" },
  });

  // Credential account — wipe + recreate so the password always matches env
  const hashedPassword = hashPassword(DEMO_PASSWORD);
  await prisma.account.deleteMany({ where: { userId: USER_ID, providerId: "credential" } });
  await prisma.account.create({
    data: { accountId: USER_ID, providerId: "credential", userId: USER_ID, password: hashedPassword },
  });

  // Organization
  await prisma.organization.upsert({
    where: { id: ORG_ID },
    create: { id: ORG_ID, name: DEMO_ORG_NAME },
    update: { name: DEMO_ORG_NAME },
  });

  // Owner membership
  await prisma.organizationMember.upsert({
    where: { userId_organizationId: { userId: USER_ID, organizationId: ORG_ID } },
    create: { userId: USER_ID, organizationId: ORG_ID, role: "owner" },
    update: { role: "owner" },
  });

  console.log(`  Owner: ${DEMO_EMAIL} (org: ${DEMO_ORG_NAME})\n`);
}

async function cleanup() {
  console.log("Cleaning existing data...");
  await prisma.technician.deleteMany({ where: { organizationId: ORG_ID } });
  await prisma.smsMessage.deleteMany({ where: { organizationId: ORG_ID } });
  await prisma.quote.deleteMany({ where: { organizationId: ORG_ID } });
  await prisma.serviceRecord.deleteMany({ where: { vehicle: { organizationId: ORG_ID } } });
  await prisma.fuelLog.deleteMany({ where: { vehicle: { organizationId: ORG_ID } } });
  await prisma.reminder.deleteMany({ where: { vehicle: { organizationId: ORG_ID } } });
  await prisma.note.deleteMany({ where: { vehicle: { organizationId: ORG_ID } } });
  await prisma.vehicle.deleteMany({ where: { organizationId: ORG_ID } });
  await prisma.customer.deleteMany({ where: { organizationId: ORG_ID } });
  await prisma.inventoryPart.deleteMany({ where: { organizationId: ORG_ID } });
  console.log("  Done.\n");
}

async function seed() {
  console.log("\nStarting seed...\n");
  await provisionDemoAccount();
  await cleanup();

  // Download images
  console.log("Downloading images...");
  for (const [file, url] of Object.entries(vehicleImages)) {
    const dest = path.join(UPLOAD_DIR, file);
    if (fs.existsSync(dest)) { console.log(`  [exists] ${file}`); continue; }
    try { await downloadFile(url, dest); console.log(`  [ok] ${file}`); }
    catch { console.warn(`  [fail] ${file}`); }
  }

  // -- Customers (20) --
  console.log("\nCreating customers...");
  const customers = await Promise.all([
    /* 0  */ prisma.customer.create({ data: { name: "Summit Construction Inc.", email: "fleet@summitconstruction.com", phone: "+1 (555) 100-2000", address: "742 Industrial Pkwy, Denver, CO 80216", company: "Summit Construction Inc.", notes: "Major fleet customer. 15 vehicles + heavy machinery. Net-30 terms.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 1  */ prisma.customer.create({ data: { name: "James Mitchell", email: "james.mitchell@gmail.com", phone: "+1 (555) 201-3344", address: "1824 Maple Ave, Austin, TX 78701", notes: "Personal vehicles. Prefers synthetic oil.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 2  */ prisma.customer.create({ data: { name: "Pacific Freight Lines", email: "service@pacificfreight.com", phone: "+1 (555) 302-5566", address: "9100 Logistics Blvd, Portland, OR 97201", company: "Pacific Freight Lines LLC", notes: "Long-haul trucking company. 8 semi-trucks. Priority service.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 3  */ prisma.customer.create({ data: { name: "Sarah Coleman", email: "sarah.coleman@outlook.com", phone: "+1 (555) 403-7788", address: "567 Oak Street, Nashville, TN 37203", notes: "BMW and Porsche owner. Always requests OEM parts.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 4  */ prisma.customer.create({ data: { name: "Metro City Services", email: "fleet@metrocityservices.gov", phone: "+1 (555) 504-9900", address: "100 City Hall Plaza, Boston, MA 02108", company: "Metro City Services", notes: "Municipal fleet contract. Quarterly invoicing. Purchase order required.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 5  */ prisma.customer.create({ data: { name: "Ryan Parker", email: "ryan.parker@icloud.com", phone: "+1 (555) 605-1122", address: "2250 Cedar Lane, Seattle, WA 98101", notes: "Tesla and Subaru owner. Tech-savvy.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 6  */ prisma.customer.create({ data: { name: "Ironclad Equipment Co.", email: "parts@ironcladequip.com", phone: "+1 (555) 706-3344", address: "4500 Heavy Machinery Rd, Houston, TX 77001", company: "Ironclad Equipment Co.", notes: "Heavy equipment dealer. Sends us overflow work. Good referral source.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 7  */ prisma.customer.create({ data: { name: "David Chen", email: "david.chen@gmail.com", phone: "+1 (555) 807-5566", address: "890 Pine Street, San Francisco, CA 94102", notes: "Audi and VW owner. Referred by James Mitchell.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 8  */ prisma.customer.create({ data: { name: "Ridgeline Excavation LLC", email: "ops@ridgelineexcavation.com", phone: "+1 (555) 908-7788", address: "1200 Quarry Rd, Salt Lake City, UT 84101", company: "Ridgeline Excavation LLC", notes: "5 excavators, 2 wheel loaders, 3 dump trucks. Monthly maintenance contract.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 9  */ prisma.customer.create({ data: { name: "Amanda Foster", email: "amanda.foster@hotmail.com", phone: "+1 (555) 109-9900", address: "334 Birch Drive, Charlotte, NC 28202", notes: "Honda Civic owner. Budget-conscious, prefers aftermarket.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 10 */ prisma.customer.create({ data: { name: "Prairie Farms Co-op", email: "maintenance@prairiefarms.com", phone: "+1 (555) 210-1122", address: "Route 66 Farm Road, Omaha, NE 68101", company: "Prairie Farms Co-op", notes: "Agricultural equipment. Tractors, harvesters. Seasonal peaks spring/fall.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 11 */ prisma.customer.create({ data: { name: "Mike Thompson", email: "mike.thompson@yahoo.com", phone: "+1 (555) 311-3344", address: "445 Elm Court, Minneapolis, MN 55401", notes: "Ford F-150 and Jeep owner. Off-road enthusiast.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 12 */ prisma.customer.create({ data: { name: "Apex Contractors Group", email: "service@apexcontractors.com", phone: "+1 (555) 412-5566", address: "2800 Builder's Row, Atlanta, GA 30301", company: "Apex Contractors Group", notes: "Small contractor. 2 excavators, 1 dump truck, 2 vans.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 13 */ prisma.customer.create({ data: { name: "Jessica Rivera", email: "jessica.r@protonmail.com", phone: "+1 (555) 513-7788", address: "1100 Sunset Blvd, Miami, FL 33101", notes: "Tesla Model Y owner. Referred by Ryan Parker.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 14 */ prisma.customer.create({ data: { name: "Titan Building Corp.", email: "projects@titanbuildingcorp.com", phone: "+1 (555) 614-9900", address: "5000 Commerce Dr, Dallas, TX 75201", company: "Titan Building Corp.", notes: "Large construction firm. 20+ pieces of equipment. Net-45 terms.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 15 */ prisma.customer.create({ data: { name: "Kevin O'Brien", email: "kevin.obrien@gmail.com", phone: "+1 (555) 715-1122", address: "678 Market Street, Philadelphia, PA 19101", notes: "Mercedes Sprinter van for his catering business.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 16 */ prisma.customer.create({ data: { name: "Greenfield Waste Management", email: "dispatch@greenfieldwaste.com", phone: "+1 (555) 816-3344", address: "7700 Recycling Way, Phoenix, AZ 85001", company: "Greenfield Waste Management", notes: "Waste management fleet. 12 trucks. Quarterly PM schedule.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 17 */ prisma.customer.create({ data: { name: "Robert Hughes", email: "robert.hughes@outlook.com", phone: "+1 (555) 917-5566", address: "2100 Lakeview Ave, Detroit, MI 48201", notes: "Ram truck and VW Golf owner. Weekend car guy.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 18 */ prisma.customer.create({ data: { name: "Heartland Grain Co.", email: "ops@heartlandgrain.com", phone: "+1 (555) 018-7788", address: "4400 Harvest Rd, Des Moines, IA 50301", company: "Heartland Grain Co.", notes: "Large-scale farming. 6 tractors, 2 combines. Seasonal rush spring and fall.", userId: USER_ID, organizationId: ORG_ID } }),
    /* 19 */ prisma.customer.create({ data: { name: "Lisa Martinez", email: "lisa.martinez@icloud.com", phone: "+1 (555) 119-9900", address: "425 Ranch Road, San Antonio, TX 78201", notes: "Chevy Silverado and Toyota Tacoma. Ranch use.", userId: USER_ID, organizationId: ORG_ID } }),
  ]);
  console.log(`  Created ${customers.length} customers`);

  // -- Vehicles (40) --
  console.log("\nCreating vehicles...");
  const vehicles = await Promise.all([
    // === Cars (0-17) ===
    /* 0  */ prisma.vehicle.create({ data: { make: "Toyota", model: "Camry XSE", year: 2023, vin: "4T1K61AK5PU083241", licensePlate: "TX-8821", color: "Midnight Black", mileage: 18500, fuelType: "gasoline", transmission: "automatic", engineSize: "2.5L", purchaseDate: new Date("2023-03-15"), purchasePrice: 35500, imageUrl: img("vehicles","toyota-camry.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[1].id } }),
    /* 1  */ prisma.vehicle.create({ data: { make: "Ford", model: "F-150 Lariat", year: 2022, vin: "1FTFW1E88NFC12345", licensePlate: "CO-4455", color: "Oxford White", mileage: 42300, fuelType: "gasoline", transmission: "automatic", engineSize: "3.5L EcoBoost", purchaseDate: new Date("2022-06-20"), purchasePrice: 58000, imageUrl: img("vehicles","ford-f150-white.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[0].id } }),
    /* 2  */ prisma.vehicle.create({ data: { make: "Ford", model: "F-150 XLT", year: 2021, vin: "1FTEW1EP5MKD56789", licensePlate: "MN-7766", color: "Carbonized Gray", mileage: 55000, fuelType: "gasoline", transmission: "automatic", engineSize: "2.7L EcoBoost", purchaseDate: new Date("2021-04-10"), purchasePrice: 45000, imageUrl: img("vehicles","ford-f150-grey.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[11].id } }),
    /* 3  */ prisma.vehicle.create({ data: { make: "Ford", model: "F-150 Platinum", year: 2024, vin: "1FTFW1E55RFA98765", licensePlate: "TX-1199", color: "Agate Black", mileage: 12000, fuelType: "gasoline", transmission: "automatic", engineSize: "3.5L EcoBoost V6", purchaseDate: new Date("2024-02-14"), purchasePrice: 72000, imageUrl: img("vehicles","ford-f150-black.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[4].id } }),
    /* 4  */ prisma.vehicle.create({ data: { make: "BMW", model: "330i xDrive", year: 2021, vin: "WBA5R1C55M7B98765", licensePlate: "TN-2233", color: "Alpine White", mileage: 55200, fuelType: "gasoline", transmission: "automatic", engineSize: "2.0L Turbo", purchaseDate: new Date("2021-01-10"), purchasePrice: 46000, imageUrl: img("vehicles","bmw-3series.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[3].id } }),
    /* 5  */ prisma.vehicle.create({ data: { make: "Honda", model: "Civic Sport", year: 2020, vin: "2HGFC2F63LH567890", licensePlate: "NC-6677", color: "Rallye Red", mileage: 67800, fuelType: "gasoline", transmission: "manual", engineSize: "2.0L", purchaseDate: new Date("2020-08-05"), purchasePrice: 26000, imageUrl: img("vehicles","honda-civic.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[9].id } }),
    /* 6  */ prisma.vehicle.create({ data: { make: "Tesla", model: "Model 3 Long Range", year: 2024, vin: "5YJ3E1EA3RF123456", licensePlate: "WA-9901", color: "Pearl White", mileage: 8200, fuelType: "electric", transmission: "automatic", engineSize: "Dual Motor", purchaseDate: new Date("2024-01-20"), purchasePrice: 47000, imageUrl: img("vehicles","tesla-model3.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[5].id } }),
    /* 7  */ prisma.vehicle.create({ data: { make: "Tesla", model: "Model Y Long Range", year: 2025, vin: "7SAYGDEE3SF123456", licensePlate: "FL-7720", color: "Quicksilver", mileage: 3200, fuelType: "electric", transmission: "automatic", engineSize: "Dual Motor AWD", purchaseDate: new Date("2025-06-10"), purchasePrice: 52000, imageUrl: img("vehicles","tesla-modely.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[13].id } }),
    /* 8  */ prisma.vehicle.create({ data: { make: "Chevrolet", model: "Silverado 2500HD", year: 2019, vin: "1GC4YREY5KF234567", licensePlate: "TX-3344", color: "Shadow Gray", mileage: 98400, fuelType: "diesel", transmission: "automatic", engineSize: "6.6L Duramax", purchaseDate: new Date("2019-04-12"), purchasePrice: 52000, imageUrl: img("vehicles","chevy-silverado.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[19].id } }),
    /* 9  */ prisma.vehicle.create({ data: { make: "Mercedes-Benz", model: "Sprinter 316 CDI", year: 2022, vin: "WDB9066331S789012", licensePlate: "PA-1122", color: "Arctic White", mileage: 35600, fuelType: "diesel", transmission: "automatic", engineSize: "2.1L CDI", purchaseDate: new Date("2022-09-01"), purchasePrice: 55000, imageUrl: img("vehicles","mercedes-sprinter.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[15].id } }),
    /* 10 */ prisma.vehicle.create({ data: { make: "Audi", model: "A4 Quattro", year: 2023, vin: "WAUDNAF44PN345678", licensePlate: "CA-5566", color: "Navarra Blue", mileage: 22100, fuelType: "gasoline", transmission: "automatic", engineSize: "2.0L TFSI", purchaseDate: new Date("2023-07-14"), purchasePrice: 45000, imageUrl: img("vehicles","audi-a4.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[7].id } }),
    /* 11 */ prisma.vehicle.create({ data: { make: "Jeep", model: "Wrangler Rubicon", year: 2022, vin: "1C4HJXFN3NW234567", licensePlate: "CO-8800", color: "Black", mileage: 28500, fuelType: "gasoline", transmission: "manual", engineSize: "3.6L Pentastar V6", purchaseDate: new Date("2022-05-18"), purchasePrice: 52000, imageUrl: img("vehicles","jeep-wrangler.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[11].id } }),
    /* 12 */ prisma.vehicle.create({ data: { make: "Jeep", model: "Wrangler Sport S", year: 2023, vin: "1C4GJXAG4PW345678", licensePlate: "GA-5511", color: "Punk'n Orange", mileage: 15200, fuelType: "gasoline", transmission: "automatic", engineSize: "2.0L Turbo", purchaseDate: new Date("2023-08-22"), purchasePrice: 42000, imageUrl: img("vehicles","jeep-wrangler-orange.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[12].id } }),
    /* 13 */ prisma.vehicle.create({ data: { make: "Porsche", model: "911 Carrera S", year: 2022, vin: "WP0AB2A94NS234567", licensePlate: "TN-9911", color: "White", mileage: 12800, fuelType: "gasoline", transmission: "automatic", engineSize: "3.0L Twin-Turbo Flat-6", purchaseDate: new Date("2022-11-05"), purchasePrice: 128000, imageUrl: img("vehicles","porsche-911.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[3].id } }),
    /* 14 */ prisma.vehicle.create({ data: { make: "Volkswagen", model: "Golf GTI", year: 2021, vin: "3VW6T7AU5MM123456", licensePlate: "CA-4422", color: "Tornado Red", mileage: 38500, fuelType: "gasoline", transmission: "manual", engineSize: "2.0L TSI", purchaseDate: new Date("2021-06-15"), purchasePrice: 32000, imageUrl: img("vehicles","vw-golf-gti-red.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[7].id } }),
    /* 15 */ prisma.vehicle.create({ data: { make: "Ram", model: "1500 Laramie", year: 2023, vin: "1C6SRFJT4PN456789", licensePlate: "MI-3322", color: "Billet Silver", mileage: 19800, fuelType: "gasoline", transmission: "automatic", engineSize: "5.7L HEMI V8", purchaseDate: new Date("2023-03-28"), purchasePrice: 62000, imageUrl: img("vehicles","ram-1500.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[17].id } }),
    /* 16 */ prisma.vehicle.create({ data: { make: "Toyota", model: "Tacoma TRD Off-Road", year: 2022, vin: "3TMCZ5AN5NM567890", licensePlate: "TX-6644", color: "Super White", mileage: 31200, fuelType: "gasoline", transmission: "automatic", engineSize: "3.5L V6", purchaseDate: new Date("2022-10-01"), purchasePrice: 42000, imageUrl: img("vehicles","toyota-tacoma.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[19].id } }),
    /* 17 */ prisma.vehicle.create({ data: { make: "Subaru", model: "Outback Wilderness", year: 2024, vin: "4S4BTGPD5R3123456", licensePlate: "WA-2211", color: "Geyser Blue", mileage: 8900, fuelType: "gasoline", transmission: "CVT", engineSize: "2.4L Turbo", purchaseDate: new Date("2024-04-15"), purchasePrice: 42000, imageUrl: img("vehicles","subaru-outback.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[5].id } }),

    // === Trucks (18-23) ===
    /* 18 */ prisma.vehicle.create({ data: { make: "Kenworth", model: "T680 Next Gen", year: 2022, vin: "1XKYD49X4NJ456789", licensePlate: "OR-8899", color: "Red", mileage: 185000, fuelType: "diesel", transmission: "automatic", engineSize: "12.9L PACCAR MX-13", purchaseDate: new Date("2022-02-15"), purchasePrice: 175000, imageUrl: img("vehicles","kenworth-t680.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[2].id } }),
    /* 19 */ prisma.vehicle.create({ data: { make: "Freightliner", model: "Cascadia 126", year: 2021, vin: "3AKJGLDR5MSAB1234", licensePlate: "OR-1123", color: "White", mileage: 245000, fuelType: "diesel", transmission: "automatic", engineSize: "14.8L Detroit DD15", purchaseDate: new Date("2021-05-20"), purchasePrice: 155000, imageUrl: img("vehicles","freightliner-cascadia.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[2].id } }),
    /* 20 */ prisma.vehicle.create({ data: { make: "Volvo", model: "FH 640", year: 2023, vin: "YV2RT40A5PB567890", licensePlate: "IL-5567", color: "Blue", mileage: 92000, fuelType: "diesel", transmission: "automatic", engineSize: "12.8L D13TC", purchaseDate: new Date("2023-01-10"), purchasePrice: 210000, imageUrl: img("vehicles","volvo-fh640.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[2].id } }),
    /* 21 */ prisma.vehicle.create({ data: { make: "Mack", model: "Granite GR64F", year: 2020, vin: "1M2AX04C5LM012345", licensePlate: "AZ-9901", color: "Yellow", mileage: 156000, fuelType: "diesel", transmission: "automatic", engineSize: "13.0L MP7", purchaseDate: new Date("2020-11-08"), purchasePrice: 140000, imageUrl: img("vehicles","mack-granite.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[0].id } }),
    /* 22 */ prisma.vehicle.create({ data: { make: "Peterbilt", model: "567 Mixer", year: 2021, vin: "1NPCD49X1MD678901", licensePlate: "TX-7788", color: "White/Blue", mileage: 68000, fuelType: "diesel", transmission: "automatic", engineSize: "10.8L PACCAR MX-11", purchaseDate: new Date("2021-07-20"), purchasePrice: 165000, imageUrl: img("vehicles","concrete-mixer.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[14].id } }),
    /* 23 */ prisma.vehicle.create({ data: { make: "Kenworth", model: "T880 Dump Truck", year: 2022, vin: "1NKZX4TX8NJ789012", licensePlate: "CO-5544", color: "Yellow", mileage: 82000, fuelType: "diesel", transmission: "automatic", engineSize: "12.9L PACCAR MX-13", purchaseDate: new Date("2022-04-15"), purchasePrice: 185000, imageUrl: img("vehicles","dump-truck.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[8].id } }),

    // === Tractors (24-30) ===
    /* 24 */ prisma.vehicle.create({ data: { make: "John Deere", model: "6R 250", year: 2022, vin: "1L06250RCNR012345", licensePlate: "N/A", color: "John Deere Green", mileage: 2800, fuelType: "diesel", transmission: "powershift", engineSize: "6.8L PowerTech PVS", purchaseDate: new Date("2022-03-01"), purchasePrice: 185000, imageUrl: img("vehicles","john-deere-6r.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[10].id } }),
    /* 25 */ prisma.vehicle.create({ data: { make: "Fendt", model: "942 Vario", year: 2023, vin: "FEN942VARIO3N56789", licensePlate: "N/A", color: "Fendt Green", mileage: 1200, fuelType: "diesel", transmission: "CVT (Vario)", engineSize: "12.4L MAN D2676", purchaseDate: new Date("2023-06-15"), purchasePrice: 420000, imageUrl: img("vehicles","fendt-942.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[18].id } }),
    /* 26 */ prisma.vehicle.create({ data: { make: "Massey Ferguson", model: "8S.265", year: 2021, vin: "MF8S265A1LM234567", licensePlate: "N/A", color: "Red", mileage: 3600, fuelType: "diesel", transmission: "Dyna-VT CVT", engineSize: "8.4L AGCO Power", purchaseDate: new Date("2021-09-10"), purchasePrice: 245000, imageUrl: img("vehicles","massey-ferguson.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[10].id } }),
    /* 27 */ prisma.vehicle.create({ data: { make: "John Deere", model: "8R 410", year: 2024, vin: "1RW8410RPEN345678", licensePlate: "N/A", color: "Green/Yellow", mileage: 800, fuelType: "diesel", transmission: "e23 PowerShift", engineSize: "9.0L PowerTech PSS", purchaseDate: new Date("2024-01-20"), purchasePrice: 380000, imageUrl: img("vehicles","tractor-wheat.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[18].id } }),
    /* 28 */ prisma.vehicle.create({ data: { make: "New Holland", model: "T7.315", year: 2022, vin: "NH7315ACLM456789", licensePlate: "N/A", color: "New Holland Blue", mileage: 2100, fuelType: "diesel", transmission: "Auto Command CVT", engineSize: "6.7L NEF", purchaseDate: new Date("2022-08-05"), purchasePrice: 210000, imageUrl: img("vehicles","tractor-field.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[10].id } }),
    /* 29 */ prisma.vehicle.create({ data: { make: "John Deere", model: "S780 Combine", year: 2023, vin: "1H0S780SPN567890", licensePlate: "N/A", color: "Green/Yellow", mileage: 600, fuelType: "diesel", transmission: "hydrostatic", engineSize: "13.5L PowerTech PSS", purchaseDate: new Date("2023-05-10"), purchasePrice: 520000, imageUrl: img("vehicles","combine-harvester.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[18].id } }),
    /* 30 */ prisma.vehicle.create({ data: { make: "John Deere", model: "X9 1100 Combine", year: 2024, vin: "1H0X91100RN678901", licensePlate: "N/A", color: "Green/Yellow", mileage: 350, fuelType: "diesel", transmission: "hydrostatic", engineSize: "13.6L PowerTech", purchaseDate: new Date("2024-03-15"), purchasePrice: 680000, imageUrl: img("vehicles","combine-jd.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[18].id } }),

    // === Heavy Machinery (31-39) ===
    /* 31 */ prisma.vehicle.create({ data: { make: "Caterpillar", model: "D6 XE Bulldozer", year: 2021, vin: "CAT0D6XE2LM012345", licensePlate: "N/A", color: "CAT Yellow", mileage: 4200, fuelType: "diesel", transmission: "automatic", engineSize: "9.3L C9.3B", purchaseDate: new Date("2021-03-25"), purchasePrice: 320000, imageUrl: img("vehicles","cat-d6-bulldozer.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[0].id } }),
    /* 32 */ prisma.vehicle.create({ data: { make: "Caterpillar", model: "D8T Bulldozer", year: 2020, vin: "CAT0D8T2KM234567", licensePlate: "N/A", color: "CAT Yellow", mileage: 5800, fuelType: "diesel", transmission: "automatic", engineSize: "15.2L C15", purchaseDate: new Date("2020-06-10"), purchasePrice: 480000, imageUrl: img("vehicles","bulldozer-rocks.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[14].id } }),
    /* 33 */ prisma.vehicle.create({ data: { make: "Komatsu", model: "PC210LC-11 Excavator", year: 2022, vin: "KMTPC210LCN234567", licensePlate: "N/A", color: "Komatsu Blue/White", mileage: 3100, fuelType: "diesel", transmission: "hydraulic", engineSize: "6.7L SAA6D107E-3", purchaseDate: new Date("2022-07-12"), purchasePrice: 265000, imageUrl: img("vehicles","komatsu-excavator.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[8].id } }),
    /* 34 */ prisma.vehicle.create({ data: { make: "Komatsu", model: "PC490LC-11 Excavator", year: 2023, vin: "KMTPC490LCN345678", licensePlate: "N/A", color: "Komatsu Yellow", mileage: 1800, fuelType: "diesel", transmission: "hydraulic", engineSize: "15.2L SAA6D170E-7", purchaseDate: new Date("2023-01-20"), purchasePrice: 450000, imageUrl: img("vehicles","excavator-soil.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[8].id } }),
    /* 35 */ prisma.vehicle.create({ data: { make: "Volvo", model: "EC220E Excavator", year: 2023, vin: "VOLEC220EN3M345678", licensePlate: "N/A", color: "Volvo Yellow", mileage: 1500, fuelType: "diesel", transmission: "hydraulic", engineSize: "5.7L D6J", purchaseDate: new Date("2023-02-20"), purchasePrice: 280000, imageUrl: img("vehicles","volvo-ec220e.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[8].id } }),
    /* 36 */ prisma.vehicle.create({ data: { make: "Kubota", model: "KX040-4 Mini Excavator", year: 2023, vin: "KUB040KX4N3456789", licensePlate: "N/A", color: "Orange", mileage: 900, fuelType: "diesel", transmission: "hydraulic", engineSize: "1.8L D1803-CR-TE4", purchaseDate: new Date("2023-09-15"), purchasePrice: 62000, imageUrl: img("vehicles","mini-excavator.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[12].id } }),
    /* 37 */ prisma.vehicle.create({ data: { make: "Case", model: "621G Wheel Loader", year: 2023, vin: "CASE621GN3M456789", licensePlate: "N/A", color: "Power Tan", mileage: 1800, fuelType: "diesel", transmission: "automatic", engineSize: "6.7L FPT", purchaseDate: new Date("2023-04-18"), purchasePrice: 185000, imageUrl: img("vehicles","wheel-loader.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[4].id } }),
    /* 38 */ prisma.vehicle.create({ data: { make: "Liebherr", model: "LTM 1100-4.2 Crane", year: 2019, vin: "LBH1100LTM9K12345", licensePlate: "GA-2233", color: "Yellow", mileage: 12500, fuelType: "diesel", transmission: "automatic", engineSize: "10.7L D936", purchaseDate: new Date("2019-08-14"), purchasePrice: 850000, imageUrl: img("vehicles","liebherr-crane.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[14].id } }),
    /* 39 */ prisma.vehicle.create({ data: { make: "Toyota", model: "8FBE18 Forklift", year: 2022, vin: "TYT8FBE18N2M56789", licensePlate: "N/A", color: "Orange/Black", mileage: 4200, fuelType: "electric", transmission: "automatic", engineSize: "48V AC Motor", purchaseDate: new Date("2022-11-01"), purchasePrice: 35000, imageUrl: img("vehicles","forklift.jpg"), userId: USER_ID, organizationId: ORG_ID, customerId: customers[6].id } }),
  ]);
  console.log(`  Created ${vehicles.length} vehicles`);

  // -- Service Records (20) --
  console.log("\nCreating service records...");
  const svcData = [
    { vehicleId: vehicles[0].id, title: "Oil Change & Tire Rotation", description: "Regular 10,000 mi service. Synthetic 0W-20 oil. Rotated tires front to back.", type: "maintenance", status: "completed", serviceDate: new Date("2025-11-15"), mileage: 15000, techName: "Jake Wilson", shopName: "Egeland Auto",
      partItems: [{ name: "Synthetic Oil 0W-20 (5qt)", partNumber: "TOY-0W20-5Q", quantity: 1, unitPrice: 42, total: 42 }, { name: "Oil Filter", partNumber: "TOY-OF-2023", quantity: 1, unitPrice: 12, total: 12 }],
      laborItems: [{ description: "Oil change and filter replacement", hours: 0.5, rate: 95, total: 47.50 }, { description: "Tire rotation and pressure check", hours: 0.3, rate: 95, total: 28.50 }],
      subtotal: 130, taxRate: 8, taxAmount: 10.40, totalAmount: 140.40 },
    { vehicleId: vehicles[4].id, title: "50,000 Mile Major Service", description: "Major service interval. Replaced brake pads, rotors, spark plugs. Full inspection.", type: "maintenance", status: "completed", serviceDate: new Date("2025-10-20"), mileage: 50000, techName: "Chris Taylor", shopName: "Egeland Auto",
      partItems: [{ name: "Front Brake Pad Set", partNumber: "BMW-BP-F34", quantity: 1, unitPrice: 185, total: 185 }, { name: "Front Brake Rotors (pair)", partNumber: "BMW-BR-F34", quantity: 1, unitPrice: 320, total: 320 }, { name: "Spark Plugs (set of 4)", partNumber: "BMW-SP-N20", quantity: 1, unitPrice: 68, total: 68 }, { name: "Engine Oil 5W-30 (7qt)", partNumber: "BMW-5W30-7Q", quantity: 1, unitPrice: 89, total: 89 }],
      laborItems: [{ description: "Front brake pad and rotor replacement", hours: 2.0, rate: 110, total: 220 }, { description: "Spark plug replacement", hours: 1.0, rate: 110, total: 110 }, { description: "Oil change and multi-point inspection", hours: 1.0, rate: 110, total: 110 }],
      subtotal: 1102, taxRate: 8, taxAmount: 88.16, totalAmount: 1190.16 },
    { vehicleId: vehicles[6].id, title: "Tire Replacement - All Four", description: "Replaced all four tires. Michelin Pilot Sport 4S. Alignment check passed.", type: "repair", status: "completed", serviceDate: new Date("2026-01-08"), mileage: 7800, techName: "Jake Wilson", shopName: "Egeland Auto",
      partItems: [{ name: "Michelin Pilot Sport 4S 235/40R19", partNumber: "MICH-PS4S-2354019", quantity: 4, unitPrice: 310, total: 1240 }],
      laborItems: [{ description: "Mount and balance 4 tires", hours: 1.5, rate: 95, total: 142.50 }, { description: "Wheel alignment check", hours: 0.5, rate: 95, total: 47.50 }],
      subtotal: 1430, taxRate: 8, taxAmount: 114.40, totalAmount: 1544.40 },
    { vehicleId: vehicles[13].id, title: "Porsche 911 - Annual Service", description: "Annual service. Oil change, brake fluid flush, cabin filter. Full inspection.", type: "maintenance", status: "completed", serviceDate: new Date("2026-01-15"), mileage: 12500, techName: "Chris Taylor", shopName: "Egeland Auto",
      partItems: [{ name: "Porsche Approved Oil 0W-40 (9qt)", partNumber: "POR-0W40-9Q", quantity: 1, unitPrice: 165, total: 165 }, { name: "Oil Filter", partNumber: "POR-OF-992", quantity: 1, unitPrice: 28, total: 28 }, { name: "Brake Fluid DOT4 (1L)", partNumber: "POR-BF-DOT4", quantity: 2, unitPrice: 35, total: 70 }],
      laborItems: [{ description: "Oil and filter change", hours: 1.0, rate: 145, total: 145 }, { description: "Brake fluid flush all 4 corners", hours: 1.5, rate: 145, total: 217.50 }, { description: "Multi-point inspection", hours: 1.0, rate: 145, total: 145 }],
      subtotal: 770.50, taxRate: 8, taxAmount: 61.64, totalAmount: 832.14 },
    { vehicleId: vehicles[18].id, title: "150K Mile Engine Service - Kenworth", description: "Major engine service. Replaced fuel filters, air filters, coolant flush. DPF regen.", type: "maintenance", status: "completed", serviceDate: new Date("2025-12-05"), mileage: 180000, techName: "Marcus Reed", shopName: "Egeland Auto",
      partItems: [{ name: "PACCAR MX-13 Fuel Filter Kit", partNumber: "PAC-FF-MX13", quantity: 1, unitPrice: 125, total: 125 }, { name: "Air Filter Element", partNumber: "PAC-AF-MX13", quantity: 1, unitPrice: 85, total: 85 }, { name: "Coolant (5gal)", partNumber: "PAC-COOL-5G", quantity: 2, unitPrice: 65, total: 130 }, { name: "Engine Oil 15W-40 (10gal)", partNumber: "PAC-15W40-10G", quantity: 1, unitPrice: 280, total: 280 }],
      laborItems: [{ description: "Engine oil and filter change", hours: 2.0, rate: 125, total: 250 }, { description: "Fuel filter replacement", hours: 1.0, rate: 125, total: 125 }, { description: "Coolant flush and refill", hours: 1.5, rate: 125, total: 187.50 }, { description: "DPF regeneration and diagnostic", hours: 1.5, rate: 125, total: 187.50 }],
      subtotal: 1370, taxRate: 8, taxAmount: 109.60, totalAmount: 1479.60 },
    { vehicleId: vehicles[20].id, title: "Volvo FH 640 - DOT Inspection", description: "Full annual inspection per DOT regulations. Brake test, emissions, lights, safety.", type: "inspection", status: "in_progress", serviceDate: new Date("2026-02-18"), mileage: 92000, techName: "Marcus Reed", shopName: "Egeland Auto",
      partItems: [{ name: "Marker Light Bulbs (pack of 10)", partNumber: "VOL-MLB-10", quantity: 1, unitPrice: 35, total: 35 }, { name: "Wiper Blades (pair)", partNumber: "VOL-WB-FH", quantity: 1, unitPrice: 52, total: 52 }],
      laborItems: [{ description: "Full DOT inspection and documentation", hours: 4.0, rate: 125, total: 500 }, { description: "Minor repairs and adjustments", hours: 2.0, rate: 125, total: 250 }],
      subtotal: 837, taxRate: 8, taxAmount: 66.96, totalAmount: 903.96 },
    { vehicleId: vehicles[24].id, title: "John Deere 6R 250 - 500hr Service", description: "Scheduled 500-hour service. Engine oil, all filters, hydraulic fluid sample, PTO check.", type: "maintenance", status: "completed", serviceDate: new Date("2026-01-20"), mileage: 2500, techName: "Marcus Reed", shopName: "Egeland Auto",
      partItems: [{ name: "Engine Oil 15W-40 (5gal)", partNumber: "JD-15W40-5G", quantity: 1, unitPrice: 185, total: 185 }, { name: "Oil Filter", partNumber: "JD-OF-6R", quantity: 1, unitPrice: 32, total: 32 }, { name: "Fuel Filter Kit", partNumber: "JD-FFK-6R", quantity: 1, unitPrice: 68, total: 68 }, { name: "Hydraulic Filter", partNumber: "JD-HF-6R", quantity: 1, unitPrice: 55, total: 55 }, { name: "Air Filter Inner+Outer", partNumber: "JD-AF-6R", quantity: 1, unitPrice: 78, total: 78 }],
      laborItems: [{ description: "Engine oil and all filter replacement", hours: 2.0, rate: 140, total: 280 }, { description: "Hydraulic fluid sampling and analysis", hours: 0.5, rate: 140, total: 70 }, { description: "PTO and 3-point hitch inspection", hours: 1.0, rate: 140, total: 140 }, { description: "Grease all fittings (32 points)", hours: 1.5, rate: 140, total: 210 }],
      subtotal: 1118, taxRate: 8, taxAmount: 89.44, totalAmount: 1207.44 },
    { vehicleId: vehicles[25].id, title: "Fendt 942 - CVT Transmission Service", description: "CVT transmission fluid and filter change. Vario calibration and function test.", type: "maintenance", status: "completed", serviceDate: new Date("2025-11-10"), mileage: 1100, techName: "Chris Taylor", shopName: "Egeland Auto",
      partItems: [{ name: "Vario CVT Fluid (10gal)", partNumber: "FENDT-CVT-10G", quantity: 1, unitPrice: 420, total: 420 }, { name: "CVT Filter Kit", partNumber: "FENDT-CVTF-942", quantity: 1, unitPrice: 165, total: 165 }],
      laborItems: [{ description: "CVT transmission fluid drain and refill", hours: 3.0, rate: 150, total: 450 }, { description: "CVT filter replacement", hours: 1.5, rate: 150, total: 225 }, { description: "Vario transmission calibration", hours: 2.0, rate: 150, total: 300 }],
      subtotal: 1560, taxRate: 8, taxAmount: 124.80, totalAmount: 1684.80 },
    { vehicleId: vehicles[31].id, title: "CAT D6 - Hydraulic System Overhaul", description: "Complete hydraulic system service. Replaced main pump seals, flushed system, new filters.", type: "repair", status: "completed", serviceDate: new Date("2025-09-18"), mileage: 4000, techName: "Marcus Reed", shopName: "Egeland Auto",
      partItems: [{ name: "Hydraulic Pump Seal Kit", partNumber: "CAT-HPS-D6", quantity: 1, unitPrice: 450, total: 450 }, { name: "Hydraulic Oil (55gal drum)", partNumber: "CAT-HO-55G", quantity: 1, unitPrice: 850, total: 850 }, { name: "Hydraulic Filter Set", partNumber: "CAT-HF-D6", quantity: 2, unitPrice: 120, total: 240 }],
      laborItems: [{ description: "Hydraulic pump disassembly and seal replacement", hours: 6.0, rate: 140, total: 840 }, { description: "System flush and refill", hours: 3.0, rate: 140, total: 420 }, { description: "Pressure testing and calibration", hours: 2.0, rate: 140, total: 280 }],
      subtotal: 3080, taxRate: 8, taxAmount: 246.40, totalAmount: 3326.40 },
    { vehicleId: vehicles[33].id, title: "Komatsu PC210 - Track Chain Replacement", description: "Replaced both track chains and sprockets. Undercarriage inspection completed.", type: "repair", status: "completed", serviceDate: new Date("2026-01-22"), mileage: 3000, techName: "Chris Taylor", shopName: "Egeland Auto",
      partItems: [{ name: "Track Chain Assembly (left)", partNumber: "KOM-TC-PC210L", quantity: 1, unitPrice: 2800, total: 2800 }, { name: "Track Chain Assembly (right)", partNumber: "KOM-TC-PC210R", quantity: 1, unitPrice: 2800, total: 2800 }, { name: "Track Sprocket (pair)", partNumber: "KOM-TS-PC210", quantity: 1, unitPrice: 1200, total: 1200 }],
      laborItems: [{ description: "Track chain removal and installation (both sides)", hours: 8.0, rate: 140, total: 1120 }, { description: "Sprocket replacement", hours: 3.0, rate: 140, total: 420 }, { description: "Undercarriage inspection", hours: 2.0, rate: 140, total: 280 }],
      subtotal: 8620, taxRate: 8, taxAmount: 689.60, totalAmount: 9309.60 },
    { vehicleId: vehicles[35].id, title: "Volvo EC220E - 1000hr Full Service", description: "All fluids, filters, track tension, swing bearing inspection.", type: "maintenance", status: "in_progress", serviceDate: new Date("2026-02-25"), mileage: 1500, techName: "Chris Taylor", shopName: "Egeland Auto",
      partItems: [{ name: "Engine Oil 15W-40 (5gal)", partNumber: "VOL-15W40-5G", quantity: 1, unitPrice: 185, total: 185 }, { name: "Hydraulic Filter Set", partNumber: "VOL-HFS-EC220", quantity: 1, unitPrice: 120, total: 120 }, { name: "Fuel Filter Kit", partNumber: "VOL-FFK-EC220", quantity: 1, unitPrice: 58, total: 58 }],
      laborItems: [{ description: "Engine oil and all filter replacement", hours: 2.5, rate: 140, total: 350 }, { description: "Track tension adjustment", hours: 1.0, rate: 140, total: 140 }, { description: "Full grease service (48 points)", hours: 2.0, rate: 140, total: 280 }],
      subtotal: 1133, taxRate: 8, taxAmount: 90.64, totalAmount: 1223.64 },
    { vehicleId: vehicles[11].id, title: "Jeep Wrangler - Lift Kit Install", description: "2.5\" suspension lift, new shocks, extended brake lines. Alignment after.", type: "repair", status: "completed", serviceDate: new Date("2026-02-10"), mileage: 28000, techName: "Jake Wilson", shopName: "Egeland Auto",
      partItems: [{ name: "Mopar 2.5\" Lift Kit", partNumber: "JEEP-LK-25", quantity: 1, unitPrice: 1200, total: 1200 }, { name: "Bilstein 5100 Shocks (set of 4)", partNumber: "BIL-5100-JL4", quantity: 1, unitPrice: 680, total: 680 }, { name: "Extended Brake Lines", partNumber: "JEEP-EBL-JL", quantity: 1, unitPrice: 120, total: 120 }],
      laborItems: [{ description: "Suspension lift installation", hours: 6.0, rate: 110, total: 660 }, { description: "Brake line routing and bleed", hours: 1.0, rate: 110, total: 110 }, { description: "4-wheel alignment", hours: 1.5, rate: 110, total: 165 }],
      subtotal: 2935, taxRate: 8, taxAmount: 234.80, totalAmount: 3169.80 },
    { vehicleId: vehicles[9].id, title: "Sprinter - Turbocharger Replacement", description: "Turbo shaft play detected. Black smoke under boost. Replaced turbo assembly.", type: "repair", status: "in_progress", serviceDate: new Date("2026-02-19"), mileage: 35400, techName: "Chris Taylor", shopName: "Egeland Auto",
      partItems: [{ name: "Turbocharger Assembly - OM651", partNumber: "MB-TURBO-OM651", quantity: 1, unitPrice: 1280, total: 1280 }, { name: "Turbo Oil Feed Line", partNumber: "MB-TOFL-OM651", quantity: 1, unitPrice: 68, total: 68 }, { name: "Turbo Gasket Kit", partNumber: "MB-TGK-OM651", quantity: 1, unitPrice: 42, total: 42 }],
      laborItems: [{ description: "Turbocharger removal", hours: 3.0, rate: 125, total: 375 }, { description: "New turbo installation and oil line", hours: 2.5, rate: 125, total: 312.50 }],
      subtotal: 2077.50, taxRate: 8, taxAmount: 166.20, totalAmount: 2243.70 },
    { vehicleId: vehicles[26].id, title: "Massey Ferguson 8S - Hydraulic Pump", description: "Low hydraulic pressure. Replaced main pump and flushed system.", type: "repair", status: "completed", serviceDate: new Date("2026-02-05"), mileage: 3500, techName: "Marcus Reed", shopName: "Egeland Auto",
      partItems: [{ name: "Main Hydraulic Pump Assembly", partNumber: "MF-HPA-8S", quantity: 1, unitPrice: 1650, total: 1650 }, { name: "Hydraulic Oil (15gal)", partNumber: "HYD-ISO46-15G", quantity: 1, unitPrice: 280, total: 280 }, { name: "Hydraulic Filter Set", partNumber: "MF-HFS-8S", quantity: 1, unitPrice: 95, total: 95 }],
      laborItems: [{ description: "Hydraulic pump removal", hours: 4.0, rate: 140, total: 560 }, { description: "New pump installation", hours: 3.0, rate: 140, total: 420 }, { description: "System flush and pressure test", hours: 2.0, rate: 140, total: 280 }],
      subtotal: 3285, taxRate: 8, taxAmount: 262.80, totalAmount: 3547.80 },
    { vehicleId: vehicles[15].id, title: "Ram 1500 - Brake Service", description: "Front and rear brake pad replacement. Rotor resurface. Fluid flush.", type: "maintenance", status: "completed", serviceDate: new Date("2026-01-28"), mileage: 19500, techName: "Jake Wilson", shopName: "Egeland Auto",
      partItems: [{ name: "Front Brake Pad Set", partNumber: "RAM-BP-F-DS", quantity: 1, unitPrice: 145, total: 145 }, { name: "Rear Brake Pad Set", partNumber: "RAM-BP-R-DS", quantity: 1, unitPrice: 125, total: 125 }, { name: "Brake Fluid DOT4 (1L)", partNumber: "BF-DOT4-1L", quantity: 2, unitPrice: 18, total: 36 }],
      laborItems: [{ description: "Front brake pad replacement", hours: 1.5, rate: 110, total: 165 }, { description: "Rear brake pad replacement", hours: 1.0, rate: 110, total: 110 }, { description: "Rotor resurface (all 4)", hours: 1.0, rate: 110, total: 110 }, { description: "Brake fluid flush", hours: 0.5, rate: 110, total: 55 }],
      subtotal: 746, taxRate: 8, taxAmount: 59.68, totalAmount: 805.68 },
    { vehicleId: vehicles[14].id, title: "VW Golf GTI - DSG Service + Oil", description: "DSG transmission fluid/filter. Engine oil change. Cabin filter.", type: "maintenance", status: "completed", serviceDate: new Date("2025-12-20"), mileage: 38000, techName: "Jake Wilson", shopName: "Egeland Auto",
      partItems: [{ name: "DSG Fluid (7qt)", partNumber: "VW-DSG-7Q", quantity: 1, unitPrice: 145, total: 145 }, { name: "DSG Filter", partNumber: "VW-DSGF", quantity: 1, unitPrice: 52, total: 52 }, { name: "Engine Oil 5W-40 (5qt)", partNumber: "VW-5W40-5Q", quantity: 1, unitPrice: 58, total: 58 }],
      laborItems: [{ description: "DSG fluid and filter change", hours: 1.5, rate: 110, total: 165 }, { description: "Engine oil and filter change", hours: 0.5, rate: 110, total: 55 }],
      subtotal: 475, taxRate: 8, taxAmount: 38, totalAmount: 513 },
    { vehicleId: vehicles[21].id, title: "Mack Granite - PTO Pump Replacement", description: "PTO pump failed. No hydraulic pressure for dump body. Replaced and tested.", type: "repair", status: "completed", serviceDate: new Date("2025-12-28"), mileage: 154000, techName: "Marcus Reed", shopName: "Egeland Auto",
      partItems: [{ name: "PTO Hydraulic Pump", partNumber: "MACK-PTO-GR64", quantity: 1, unitPrice: 1450, total: 1450 }, { name: "PTO Mounting Gasket Kit", partNumber: "MACK-PTO-GK", quantity: 1, unitPrice: 85, total: 85 }, { name: "Hydraulic Oil (10gal)", partNumber: "HYD-ISO46-10G", quantity: 1, unitPrice: 180, total: 180 }],
      laborItems: [{ description: "PTO pump removal", hours: 3.0, rate: 140, total: 420 }, { description: "New pump installation", hours: 2.5, rate: 140, total: 350 }, { description: "System prime and dump cycle test", hours: 1.5, rate: 140, total: 210 }],
      subtotal: 2695, taxRate: 8, taxAmount: 215.60, totalAmount: 2910.60 },
    { vehicleId: vehicles[37].id, title: "Case 621G - Bucket Cylinder Reseal", description: "Bucket cylinder leaking. Resealed both cylinders. Tested under load.", type: "repair", status: "completed", serviceDate: new Date("2025-11-28"), mileage: 1700, techName: "Chris Taylor", shopName: "Egeland Auto",
      partItems: [{ name: "Bucket Cylinder Seal Kit (pair)", partNumber: "CASE-BCSK-621G", quantity: 1, unitPrice: 380, total: 380 }, { name: "Hydraulic Oil (5gal)", partNumber: "HYD-ISO46-5G", quantity: 2, unitPrice: 95, total: 190 }],
      laborItems: [{ description: "Cylinder removal and disassembly", hours: 3.0, rate: 140, total: 420 }, { description: "Reseal and reassembly", hours: 2.5, rate: 140, total: 350 }, { description: "System bleed and pressure test", hours: 1.5, rate: 140, total: 210 }],
      subtotal: 1550, taxRate: 8, taxAmount: 124, totalAmount: 1674 },
    { vehicleId: vehicles[1].id, title: "F-150 Transmission Fluid Flush", description: "Customer reported rough shifting. Flushed transmission fluid, replaced filter.", type: "repair", status: "completed", serviceDate: new Date("2026-02-01"), mileage: 41500, techName: "Jake Wilson", shopName: "Egeland Auto",
      partItems: [{ name: "Mercon ULV ATF (12qt)", partNumber: "FORD-ATF-ULV", quantity: 1, unitPrice: 185, total: 185 }, { name: "Transmission Filter Kit", partNumber: "FORD-TFK-10R80", quantity: 1, unitPrice: 68, total: 68 }],
      laborItems: [{ description: "Transmission fluid flush", hours: 2.0, rate: 110, total: 220 }, { description: "Filter and gasket replacement", hours: 1.5, rate: 110, total: 165 }],
      subtotal: 638, taxRate: 8, taxAmount: 51.04, totalAmount: 689.04 },
  ];

  const serviceRecords = [];
  for (const sr of svcData) {
    const { partItems, laborItems, ...data } = sr;
    const record = await prisma.serviceRecord.create({ data: { ...data, cost: data.totalAmount, partItems: { create: partItems }, laborItems: { create: laborItems } } });
    serviceRecords.push(record);
  }
  console.log(`  Created ${serviceRecords.length} service records`);

  // -- Quotes (15) --
  console.log("\nCreating quotes...");
  const qData = [
    { quoteNumber: "Q-2026-001", title: "Full Brake Overhaul - BMW 330i", status: "sent", validUntil: new Date("2026-03-15"), customerId: customers[3].id, vehicleId: vehicles[4].id,
      partItems: [{ name: "Front Brake Rotor Set (OEM)", partNumber: "BMW-BR-F34-OEM", quantity: 1, unitPrice: 480, total: 480 }, { name: "Rear Brake Rotor Set (OEM)", partNumber: "BMW-BR-R34-OEM", quantity: 1, unitPrice: 390, total: 390 }, { name: "Front Brake Pad Set (OEM)", partNumber: "BMW-BP-F34-OEM", quantity: 1, unitPrice: 220, total: 220 }],
      laborItems: [{ description: "Front brake rotor and pad replacement", hours: 2.5, rate: 110, total: 275 }, { description: "Rear brake rotor replacement", hours: 2.0, rate: 110, total: 220 }],
      subtotal: 1585, taxRate: 8, taxAmount: 126.80, totalAmount: 1711.80 },
    { quoteNumber: "Q-2026-002", title: "200K Engine Service - Kenworth T680", status: "accepted", validUntil: new Date("2026-03-01"), customerId: customers[2].id, vehicleId: vehicles[18].id,
      partItems: [{ name: "PACCAR MX-13 Overhaul Kit", partNumber: "PAC-OHK-MX13", quantity: 1, unitPrice: 850, total: 850 }, { name: "Injector Set (6)", partNumber: "PAC-INJ-MX13-6", quantity: 1, unitPrice: 1420, total: 1420 }],
      laborItems: [{ description: "Injector replacement (6 cylinders)", hours: 8.0, rate: 140, total: 1120 }, { description: "Valve adjustment", hours: 4.0, rate: 140, total: 560 }],
      subtotal: 3950, taxRate: 8, taxAmount: 316, totalAmount: 4266 },
    { quoteNumber: "Q-2026-003", title: "CAT D6 Undercarriage Rebuild", status: "sent", validUntil: new Date("2026-03-30"), customerId: customers[0].id, vehicleId: vehicles[31].id,
      partItems: [{ name: "Track Chain Assembly (pair)", partNumber: "CAT-TCA-D6", quantity: 1, unitPrice: 6500, total: 6500 }, { name: "Track Roller Set (14 pcs)", partNumber: "CAT-TR-D6-14", quantity: 1, unitPrice: 4200, total: 4200 }, { name: "Sprocket Set (pair)", partNumber: "CAT-SS-D6", quantity: 1, unitPrice: 1500, total: 1500 }],
      laborItems: [{ description: "Complete undercarriage disassembly", hours: 12.0, rate: 140, total: 1680 }, { description: "Component installation", hours: 16.0, rate: 140, total: 2240 }],
      subtotal: 16120, taxRate: 8, taxAmount: 1289.60, totalAmount: 17409.60 },
    { quoteNumber: "Q-2026-004", title: "John Deere 6R - Front Axle Overhaul", status: "sent", validUntil: new Date("2026-04-15"), customerId: customers[10].id, vehicleId: vehicles[24].id,
      partItems: [{ name: "Front Axle Bearing Kit", partNumber: "JD-FABK-6R", quantity: 1, unitPrice: 520, total: 520 }, { name: "CV Joint Assembly (pair)", partNumber: "JD-CVJ-6R", quantity: 1, unitPrice: 850, total: 850 }],
      laborItems: [{ description: "Front axle removal", hours: 5.0, rate: 140, total: 700 }, { description: "Bearing and CV replacement", hours: 4.0, rate: 140, total: 560 }],
      subtotal: 2630, taxRate: 8, taxAmount: 210.40, totalAmount: 2840.40 },
    { quoteNumber: "Q-2026-005", title: "Honda Civic - Clutch Replacement", status: "accepted", validUntil: new Date("2026-03-10"), customerId: customers[9].id, vehicleId: vehicles[5].id,
      partItems: [{ name: "Clutch Kit (disc, plate, bearing)", partNumber: "HON-CLK-FK7", quantity: 1, unitPrice: 380, total: 380 }],
      laborItems: [{ description: "Transmission removal and clutch replacement", hours: 5.0, rate: 110, total: 550 }, { description: "Reinstallation and test drive", hours: 2.0, rate: 110, total: 220 }],
      subtotal: 1150, taxRate: 8, taxAmount: 92, totalAmount: 1242 },
    { quoteNumber: "Q-2026-006", title: "Volvo FH 640 - Air Suspension Repair", status: "accepted", validUntil: new Date("2026-03-10"), customerId: customers[2].id, vehicleId: vehicles[20].id,
      partItems: [{ name: "Rear Air Spring (pair)", partNumber: "VOL-RAS-FH", quantity: 1, unitPrice: 560, total: 560 }, { name: "Height Sensor", partNumber: "VOL-HS-FH", quantity: 1, unitPrice: 240, total: 240 }],
      laborItems: [{ description: "Air bag replacement (both sides)", hours: 3.0, rate: 140, total: 420 }, { description: "Sensor replacement and calibration", hours: 1.5, rate: 140, total: 210 }],
      subtotal: 1430, taxRate: 8, taxAmount: 114.40, totalAmount: 1544.40 },
    { quoteNumber: "Q-2026-007", title: "Fendt 942 - A/C Compressor Repair", status: "draft", validUntil: new Date("2026-04-10"), customerId: customers[18].id, vehicleId: vehicles[25].id,
      partItems: [{ name: "A/C Compressor - Fendt 942", partNumber: "FENDT-ACC-942", quantity: 1, unitPrice: 890, total: 890 }, { name: "Condenser Assembly", partNumber: "FENDT-COND-942", quantity: 1, unitPrice: 450, total: 450 }],
      laborItems: [{ description: "Cab disassembly for A/C access", hours: 3.0, rate: 150, total: 450 }, { description: "Compressor and condenser replacement", hours: 4.0, rate: 150, total: 600 }],
      subtotal: 2390, taxRate: 8, taxAmount: 191.20, totalAmount: 2581.20 },
    { quoteNumber: "Q-2026-008", title: "Komatsu PC210 - Boom Cylinder Reseal", status: "sent", validUntil: new Date("2026-03-25"), customerId: customers[8].id, vehicleId: vehicles[33].id,
      partItems: [{ name: "Boom Cylinder Seal Kit (pair)", partNumber: "KOM-BCSK-PC210", quantity: 1, unitPrice: 520, total: 520 }, { name: "Hydraulic Oil (10gal)", partNumber: "HYD-ISO46-10G", quantity: 1, unitPrice: 180, total: 180 }],
      laborItems: [{ description: "Boom cylinder removal", hours: 4.0, rate: 140, total: 560 }, { description: "Disassembly and reseal", hours: 3.0, rate: 140, total: 420 }],
      subtotal: 1680, taxRate: 8, taxAmount: 134.40, totalAmount: 1814.40 },
    { quoteNumber: "Q-2026-009", title: "Liebherr Crane - Annual Certification", status: "sent", validUntil: new Date("2026-05-01"), customerId: customers[14].id, vehicleId: vehicles[38].id,
      partItems: [{ name: "Wire Rope Inspection Kit", partNumber: "LBH-WRIK", quantity: 1, unitPrice: 250, total: 250 }, { name: "Hydraulic Hose Set (safety critical)", partNumber: "LBH-HHS-SC", quantity: 1, unitPrice: 850, total: 850 }],
      laborItems: [{ description: "Full crane inspection per OSHA", hours: 8.0, rate: 160, total: 1280 }, { description: "Hydraulic hose replacement", hours: 4.0, rate: 160, total: 640 }, { description: "Load test and certification", hours: 4.0, rate: 160, total: 640 }],
      subtotal: 3660, taxRate: 8, taxAmount: 292.80, totalAmount: 3952.80 },
    { quoteNumber: "Q-2026-010", title: "Porsche 911 - Suspension Refresh", status: "draft", validUntil: new Date("2026-04-01"), customerId: customers[3].id, vehicleId: vehicles[13].id,
      partItems: [{ name: "Bilstein B8 Dampers (set of 4)", partNumber: "POR-BIL-B8-4", quantity: 1, unitPrice: 1800, total: 1800 }, { name: "H&R Sport Springs", partNumber: "POR-HR-SS-992", quantity: 1, unitPrice: 650, total: 650 }],
      laborItems: [{ description: "Suspension removal and install", hours: 5.0, rate: 145, total: 725 }, { description: "4-corner alignment", hours: 1.5, rate: 145, total: 217.50 }],
      subtotal: 3392.50, taxRate: 8, taxAmount: 271.40, totalAmount: 3663.90 },
    { quoteNumber: "Q-2026-011", title: "Jeep Wrangler - Winch Install", status: "accepted", validUntil: new Date("2026-03-20"), customerId: customers[11].id, vehicleId: vehicles[11].id,
      partItems: [{ name: "Warn VR EVO 10-S Winch", partNumber: "WARN-VR10S", quantity: 1, unitPrice: 850, total: 850 }, { name: "Winch Mounting Plate", partNumber: "JEEP-WMP-JL", quantity: 1, unitPrice: 220, total: 220 }],
      laborItems: [{ description: "Winch and plate installation", hours: 3.0, rate: 110, total: 330 }, { description: "Wiring and relay setup", hours: 1.5, rate: 110, total: 165 }],
      subtotal: 1565, taxRate: 8, taxAmount: 125.20, totalAmount: 1690.20 },
    { quoteNumber: "Q-2026-012", title: "Fleet Oil Change Package - 10 Trucks", status: "sent", validUntil: new Date("2026-03-15"), customerId: customers[16].id, notes: "Bulk fleet pricing. Drop off in batches of 3-4.",
      partItems: [{ name: "Synthetic Oil 5W-30 (5qt) x10", partNumber: "OIL-5W30-BULK", quantity: 10, unitPrice: 38, total: 380 }, { name: "Oil Filter Assorted x10", partNumber: "OF-ASSORTED-10", quantity: 10, unitPrice: 9.50, total: 95 }],
      laborItems: [{ description: "Oil change service x10 vehicles", hours: 5.0, rate: 85, total: 425 }],
      subtotal: 900, taxRate: 8, taxAmount: 72, totalAmount: 972 },
    { quoteNumber: "Q-2026-013", title: "S780 Combine - Pre-Season Check", status: "accepted", validUntil: new Date("2026-04-15"), customerId: customers[18].id, vehicleId: vehicles[29].id,
      partItems: [{ name: "Combine Service Kit (all filters)", partNumber: "JD-CSK-S780", quantity: 1, unitPrice: 420, total: 420 }, { name: "Sickle Blade Set", partNumber: "JD-SBS-S780", quantity: 1, unitPrice: 380, total: 380 }, { name: "Feeder Chain", partNumber: "JD-FC-S780", quantity: 1, unitPrice: 650, total: 650 }],
      laborItems: [{ description: "Full filter service and oil change", hours: 3.0, rate: 140, total: 420 }, { description: "Sickle replacement and header setup", hours: 4.0, rate: 140, total: 560 }, { description: "Feeder chain replacement", hours: 3.0, rate: 140, total: 420 }],
      subtotal: 2850, taxRate: 8, taxAmount: 228, totalAmount: 3078 },
    { quoteNumber: "Q-2026-014", title: "Subaru Outback - 30K Service", status: "accepted", validUntil: new Date("2026-03-20"), customerId: customers[5].id, vehicleId: vehicles[17].id,
      partItems: [{ name: "Synthetic Oil 0W-20 (6qt)", partNumber: "SUB-0W20-6Q", quantity: 1, unitPrice: 52, total: 52 }, { name: "Oil Filter", partNumber: "SUB-OF-FA24", quantity: 1, unitPrice: 14, total: 14 }, { name: "CVT Fluid (4qt)", partNumber: "SUB-CVTF-4Q", quantity: 1, unitPrice: 85, total: 85 }],
      laborItems: [{ description: "Oil change", hours: 0.5, rate: 95, total: 47.50 }, { description: "CVT fluid change", hours: 1.0, rate: 95, total: 95 }, { description: "Multi-point inspection", hours: 0.5, rate: 95, total: 47.50 }],
      subtotal: 341, taxRate: 8, taxAmount: 27.28, totalAmount: 368.28 },
    { quoteNumber: "Q-2026-015", title: "Toyota Tacoma - Suspension Upgrade", status: "sent", validUntil: new Date("2026-04-01"), customerId: customers[19].id, vehicleId: vehicles[16].id,
      partItems: [{ name: "Bilstein 5100 Front (pair)", partNumber: "BIL-5100-TAC-F", quantity: 1, unitPrice: 340, total: 340 }, { name: "Bilstein 5100 Rear (pair)", partNumber: "BIL-5100-TAC-R", quantity: 1, unitPrice: 280, total: 280 }, { name: "OME Leaf Springs", partNumber: "OME-LS-TAC", quantity: 1, unitPrice: 450, total: 450 }],
      laborItems: [{ description: "Front strut replacement", hours: 2.5, rate: 110, total: 275 }, { description: "Rear shock and leaf spring install", hours: 3.0, rate: 110, total: 330 }, { description: "Alignment", hours: 1.0, rate: 110, total: 110 }],
      subtotal: 1785, taxRate: 8, taxAmount: 142.80, totalAmount: 1927.80 },
  ];

  const quotes = [];
  for (const q of qData) {
    const { partItems, laborItems, customerId, vehicleId, ...fields } = q;
    const quote = await prisma.quote.create({ data: { ...fields, userId: USER_ID, organizationId: ORG_ID, ...(customerId ? { customerId } : {}), ...(vehicleId ? { vehicleId } : {}), partItems: { create: partItems }, laborItems: { create: laborItems } } });
    quotes.push(quote);
  }
  console.log(`  Created ${quotes.length} quotes`);

  // -- Inventory Parts (25) --
  console.log("\nCreating inventory parts...");
  const invData = [
    { name: "Synthetic Engine Oil 5W-30 (5qt)", partNumber: "OIL-5W30-5Q", category: "Fluids & Lubricants", quantity: 24, minQuantity: 10, unitCost: 28, sellPrice: 45, supplier: "AutoZone Commercial", location: "Shelf A-1" },
    { name: "Synthetic Engine Oil 0W-20 (5qt)", partNumber: "OIL-0W20-5Q", category: "Fluids & Lubricants", quantity: 18, minQuantity: 8, unitCost: 31, sellPrice: 49, supplier: "AutoZone Commercial", location: "Shelf A-1" },
    { name: "Heavy Duty Engine Oil 15W-40 (5gal)", partNumber: "OIL-15W40-5G", category: "Fluids & Lubricants", quantity: 8, minQuantity: 4, unitCost: 120, sellPrice: 185, supplier: "Shell Fleet", location: "Shelf A-2" },
    { name: "Hydraulic Oil ISO 46 (55gal)", partNumber: "HYD-ISO46-55G", category: "Fluids & Lubricants", quantity: 3, minQuantity: 2, unitCost: 580, sellPrice: 850, supplier: "Shell Fleet", location: "Floor A-3" },
    { name: "Brake Pad Set - Universal Light Vehicle", partNumber: "BP-UNI-LV", category: "Brakes", quantity: 14, minQuantity: 6, unitCost: 38, sellPrice: 68, supplier: "NAPA Auto Parts", location: "Shelf B-1" },
    { name: "Brake Pad Set - Heavy Duty Truck", partNumber: "BP-HD-TRUCK", category: "Brakes", quantity: 6, minQuantity: 4, unitCost: 180, sellPrice: 320, supplier: "FleetPride", location: "Shelf B-2" },
    { name: "Oil Filter - European Vehicles", partNumber: "OF-EUR-01", category: "Filters", quantity: 30, minQuantity: 10, unitCost: 6.50, sellPrice: 15.50, supplier: "Mann-Filter USA", location: "Shelf C-1" },
    { name: "Oil Filter - Asian Vehicles", partNumber: "OF-ASN-01", category: "Filters", quantity: 25, minQuantity: 10, unitCost: 4.50, sellPrice: 12, supplier: "Mann-Filter USA", location: "Shelf C-1" },
    { name: "Hydraulic Filter - CAT/Komatsu", partNumber: "HF-CAT-KOM", category: "Filters", quantity: 5, minQuantity: 3, unitCost: 65, sellPrice: 120, supplier: "Cat Parts Direct", location: "Shelf C-3" },
    { name: "Spark Plug - Iridium (each)", partNumber: "SP-IRID-01", category: "Ignition", quantity: 40, minQuantity: 16, unitCost: 9.50, sellPrice: 17.50, supplier: "NGK USA", location: "Shelf D-1" },
    { name: "Car Battery 12V 700CCA", partNumber: "BAT-12V-700CCA", category: "Electrical", quantity: 6, minQuantity: 3, unitCost: 95, sellPrice: 165, supplier: "Interstate Batteries", location: "Floor D-2" },
    { name: "Truck Battery 12V 1000CCA", partNumber: "BAT-12V-1000CCA", category: "Electrical", quantity: 4, minQuantity: 2, unitCost: 240, sellPrice: 380, supplier: "Interstate Batteries", location: "Floor D-2" },
    { name: "Coolant Concentrate (1gal)", partNumber: "COOL-CONC-1G", category: "Fluids & Lubricants", quantity: 15, minQuantity: 6, unitCost: 18, sellPrice: 32, supplier: "AutoZone Commercial", location: "Shelf A-2" },
    { name: "ATF Transmission Fluid (1qt)", partNumber: "ATF-DEXVI-1Q", category: "Fluids & Lubricants", quantity: 20, minQuantity: 8, unitCost: 12, sellPrice: 22, supplier: "AutoZone Commercial", location: "Shelf A-2" },
    { name: "Serpentine Belt - Universal", partNumber: "SB-UNI-6PK", category: "Engine", quantity: 8, minQuantity: 4, unitCost: 22, sellPrice: 42, supplier: "Gates Corp", location: "Shelf D-3" },
    { name: "Hydraulic Hose - 1/2\" x 10ft", partNumber: "HH-12-10FT", category: "Hydraulics", quantity: 10, minQuantity: 4, unitCost: 45, sellPrice: 85, supplier: "Parker Hannifin", location: "Rack G-1" },
    { name: "Track Shoe Bolt Kit (set of 50)", partNumber: "TSB-KIT-50", category: "Undercarriage", quantity: 4, minQuantity: 2, unitCost: 180, sellPrice: 320, supplier: "Cat Parts Direct", location: "Floor G-2" },
    { name: "R-134a Refrigerant (30oz can)", partNumber: "R134A-30OZ", category: "HVAC", quantity: 8, minQuantity: 4, unitCost: 18, sellPrice: 32, supplier: "AutoZone Commercial", location: "Shelf H-1" },
    { name: "Fuel Filter - Diesel Universal", partNumber: "FF-DSL-UNI", category: "Filters", quantity: 12, minQuantity: 5, unitCost: 14, sellPrice: 29, supplier: "Mann-Filter USA", location: "Shelf C-2" },
    { name: "Air Filter - Heavy Equipment", partNumber: "AF-HE-UNI", category: "Filters", quantity: 6, minQuantity: 3, unitCost: 48, sellPrice: 85, supplier: "Cat Parts Direct", location: "Shelf C-3" },
    { name: "Tractor PTO Shaft Guard", partNumber: "PTO-SG-UNI", category: "Safety", quantity: 3, minQuantity: 2, unitCost: 85, sellPrice: 150, supplier: "Agri Supply Co.", location: "Rack G-3" },
    { name: "DPF Pressure Sensor", partNumber: "DPF-PS-UNI", category: "Emissions", quantity: 1, minQuantity: 3, unitCost: 65, sellPrice: 120, supplier: "Bosch USA", location: "Shelf D-5" },
    { name: "Grease Cartridge EP2 (box of 10)", partNumber: "GREASE-EP2-10", category: "Fluids & Lubricants", quantity: 12, minQuantity: 5, unitCost: 28, sellPrice: 48, supplier: "Shell Fleet", location: "Shelf A-3" },
    { name: "Combine Sickle Section (box of 25)", partNumber: "CSS-UNI-25", category: "Harvest Parts", quantity: 4, minQuantity: 2, unitCost: 65, sellPrice: 110, supplier: "Agri Supply Co.", location: "Rack G-4" },
    { name: "Wiper Blade 24\" Universal", partNumber: "WB-24-UNI", category: "Body & Exterior", quantity: 12, minQuantity: 6, unitCost: 11, sellPrice: 25, supplier: "Bosch USA", location: "Shelf E-1" },
  ];
  const inventoryParts = await Promise.all(invData.map(p => prisma.inventoryPart.create({ data: { ...p, userId: USER_ID, organizationId: ORG_ID } })));
  console.log(`  Created ${inventoryParts.length} inventory parts`);

  // -- Fuel Logs --
  console.log("\nCreating fuel logs...");
  await Promise.all([
    prisma.fuelLog.create({ data: { vehicleId: vehicles[1].id, date: new Date("2026-01-05"), mileage: 40200, gallons: 26, pricePerGallon: 3.45, totalCost: 89.70, station: "Shell - I-25 & Hampden" } }),
    prisma.fuelLog.create({ data: { vehicleId: vehicles[1].id, date: new Date("2026-02-02"), mileage: 41500, gallons: 24, pricePerGallon: 3.48, totalCost: 83.52, station: "Costco Gas - Arvada" } }),
    prisma.fuelLog.create({ data: { vehicleId: vehicles[18].id, date: new Date("2026-01-10"), mileage: 182000, gallons: 120, pricePerGallon: 3.85, totalCost: 462.00, station: "Pilot Travel Center - Portland" } }),
    prisma.fuelLog.create({ data: { vehicleId: vehicles[8].id, date: new Date("2026-02-10"), mileage: 98000, gallons: 28, pricePerGallon: 3.65, totalCost: 102.20, station: "Buc-ee's - San Antonio" } }),
    prisma.fuelLog.create({ data: { vehicleId: vehicles[24].id, date: new Date("2026-02-15"), mileage: 2700, gallons: 35, pricePerGallon: 3.78, totalCost: 132.30, station: "Co-op Fuel - Omaha" } }),
    prisma.fuelLog.create({ data: { vehicleId: vehicles[25].id, date: new Date("2026-01-28"), mileage: 1180, gallons: 80, pricePerGallon: 3.82, totalCost: 305.60, station: "Farm Bureau Fuel - Des Moines" } }),
    prisma.fuelLog.create({ data: { vehicleId: vehicles[15].id, date: new Date("2026-02-20"), mileage: 19500, gallons: 22, pricePerGallon: 3.55, totalCost: 78.10, station: "Speedway - Detroit" } }),
    prisma.fuelLog.create({ data: { vehicleId: vehicles[11].id, date: new Date("2026-01-22"), mileage: 28200, gallons: 18, pricePerGallon: 3.62, totalCost: 65.16, station: "Shell - I-70 & Morrison" } }),
  ]);
  console.log("  Created 8 fuel logs");

  // -- Reminders --
  console.log("\nCreating reminders...");
  await Promise.all([
    prisma.reminder.create({ data: { vehicleId: vehicles[0].id, title: "Next Oil Change", description: "Due at 25,000 mi or March 2026", dueDate: new Date("2026-03-15"), dueMileage: 25000 } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[4].id, title: "Brake Fluid Flush", description: "BMW recommends every 2 years", dueDate: new Date("2026-06-01") } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[18].id, title: "Annual DOT Inspection", description: "Kenworth T680 - annual inspection", dueDate: new Date("2026-02-28") } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[31].id, title: "Track Tension Check", description: "CAT D6 - check after 100 hours", dueMileage: 4500 } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[24].id, title: "1000hr Service", description: "John Deere 6R 250 - scheduled service", dueMileage: 3500 } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[25].id, title: "Spring Planting Prep", description: "Fendt 942 - full check before spring", dueDate: new Date("2026-04-01") } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[20].id, title: "Volvo FH 640 - Brake Inspection", description: "Check brakes before next long-haul", dueDate: new Date("2026-03-10") } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[13].id, title: "Porsche 911 - Track Day Prep", description: "Brake pads, fluid, tire pressure check before April track day", dueDate: new Date("2026-04-10") } }),
  ]);
  console.log("  Created 8 reminders");

  // -- Vehicle Notes --
  console.log("\nCreating vehicle notes...");
  await Promise.all([
    prisma.note.create({ data: { vehicleId: vehicles[4].id, title: "Customer preference", content: "Sarah always requests OEM BMW parts. No aftermarket. She prefers to wait while service is done.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[31].id, title: "Hydraulic leak history", content: "This D6 has had recurring hydraulic leaks on the left blade cylinder. Last repaired Sept 2025. Monitor closely.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[18].id, title: "Fleet note", content: "Pacific Freight unit #3. Driver: Tom Bradley. Call dispatch at (555) 302-5566 for scheduling.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[6].id, title: "Charging note", content: "Customer reports occasional slow charging at home. Suggested checking home charger firmware. Not a vehicle issue.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[38].id, title: "Outrigger issue", content: "Right rear outrigger cylinder slow to extend. May need seal replacement at next service.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[24].id, title: "Warranty info", content: "John Deere 6R 250 still under manufacturer warranty until March 2027. Contact JD dealer for warranty claims.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[25].id, title: "Operator preference", content: "Fendt 942 - Operator prefers front linkage set to position control, not draft. Do not change settings after service.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[20].id, title: "Volvo FH 640 fleet note", content: "Pacific Freight unit #5. Long-haul Portland to Chicago route. D13TC engine with I-Shift dual clutch.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[11].id, title: "Lift kit installed", content: "2.5\" Mopar lift with Bilstein 5100 shocks installed Feb 2026. Customer plans to add 35\" tires next.", isPinned: false } }),
  ]);
  console.log("  Created 9 vehicle notes");

  // -- Additional vehicle notes (customer preferences, reminders, history) --
  console.log("\nCreating additional vehicle notes...");
  const additionalNotes = await Promise.all([
    prisma.note.create({ data: { vehicleId: vehicles[0].id, title: "Customer preference", content: "James prefers Mobil 1 full synthetic 0W-20 on every oil change. Do not substitute.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[0].id, title: "Key location", content: "Spare key in lockbox #4 (code 4412). Customer drops off after hours sometimes.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[1].id, title: "Fleet maintenance policy", content: "Summit Construction requires photo documentation of all brake and tire work. Upload to service record.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[1].id, title: "Aftermarket bed liner", content: "Spray-in bed liner installed 2023. Don't pressure wash interior of bed at close range.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[2].id, title: "Off-road use", content: "Mike uses this for hunting trips. Undercarriage gets a lot of mud - always inspect skid plates.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[3].id, title: "Municipal contract vehicle", content: "Metro City Services - invoicing via purchase order only. PO required before work starts.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[5].id, title: "Budget-conscious customer", content: "Amanda prefers aftermarket parts where safe. Always provide OEM vs aftermarket pricing options.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[5].id, title: "Check AC vents", content: "Musty smell reported last visit. Recommended cabin filter + evaporator clean at next service.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[7].id, title: "Referral source", content: "Jessica was referred by Ryan Parker. Offer referral discount on next service.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[8].id, title: "Ranch use", content: "Silverado used for cattle hauling. Check hitch and trailer plug every visit.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[9].id, title: "Commercial use", content: "Kevin uses this daily for catering. Needs quick turnaround - try to get him in/out same day.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[10].id, title: "OEM parts only", content: "David insists on genuine Audi parts. No VAG knockoffs. He'll ask to see part numbers.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[12].id, title: "Soft top care", content: "Customer has both hard and soft top. Store removed top carefully, document any scratches.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[14].id, title: "Manual transmission", content: "David is the primary driver. Wife drives occasionally but doesn't like manual - clutch wear expected.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[15].id, title: "Weekend vehicle", content: "Robert uses this mainly weekends for towing his boat. Look at trailer brakes in spring.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[16].id, title: "TRD package notes", content: "TRD Off-Road suspension - use correct alignment specs (different from base Tacoma).", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[19].id, title: "Long-haul unit", content: "Pacific Freight unit #8. Portland-Chicago route. Driver: Miguel Santos. DEF fills every other trip.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[21].id, title: "Dump body maintenance", content: "Body floor develops cracks at 150k+ mi. Inspect weld seams during every service.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[22].id, title: "Concrete mixer drum", content: "Drum drive motor is a known weak point on this unit. Monitor for sluggish rotation.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[26].id, title: "Seasonal use", content: "Massey Ferguson is the backup tractor for Prairie Farms. Heavy use spring/fall only.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[27].id, title: "Warranty active", content: "John Deere 8R 410 still under warranty until Jan 2027. Contact JD dealer for anything covered.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[29].id, title: "Harvest critical", content: "S780 combine is CRITICAL for fall harvest. Any work needs to be done before September.", isPinned: true } }),
    prisma.note.create({ data: { vehicleId: vehicles[32].id, title: "D8T parts lead time", content: "CAT D8T parts often take 2-3 weeks. Order ahead. Titan Building will wait if told up front.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[34].id, title: "Undercarriage wear", content: "Track chains due for replacement around 2000hr. Currently at 1800hr — budget planning.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[37].id, title: "Metro City asset tag", content: "City asset tag #WL-014. Include in all invoices for their records.", isPinned: false } }),
    prisma.note.create({ data: { vehicleId: vehicles[39].id, title: "Indoor use only", content: "Electric forklift used indoors at Ironclad warehouse. Tire compound is non-marking.", isPinned: false } }),
  ]);
  console.log(`  Created ${additionalNotes.length} additional vehicle notes`);

  // -- Additional reminders --
  console.log("\nCreating additional reminders...");
  const additionalReminders = await Promise.all([
    prisma.reminder.create({ data: { vehicleId: vehicles[1].id, title: "Timing belt replacement", description: "Interval-based - EcoBoost timing chain inspection due", dueMileage: 60000 } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[2].id, title: "Annual inspection", description: "Minnesota state safety inspection", dueDate: new Date("2026-05-15") } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[5].id, title: "Brake fluid flush", description: "Honda recommends every 3 years", dueMileage: 72000, dueDate: new Date("2026-06-01") } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[8].id, title: "Registration renewal", description: "Texas registration expires June 2026", dueDate: new Date("2026-06-30") } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[9].id, title: "Next oil change", description: "Sprinter service B interval", dueMileage: 40000 } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[10].id, title: "Haldex service", description: "Quattro rear diff fluid change - 40K interval", dueMileage: 40000, isCompleted: true } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[11].id, title: "Front diff fluid", description: "After lift kit, recommend fluid change at 35K", dueMileage: 35000 } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[12].id, title: "Annual inspection", description: "Georgia annual safety inspection", dueDate: new Date("2026-08-22") } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[14].id, title: "DSG service interval", description: "Next DSG fluid/filter at 78K", dueMileage: 78000 } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[17].id, title: "CVT fluid check", description: "Subaru CVT recommended drain/fill", dueMileage: 30000 } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[19].id, title: "DOT inspection", description: "Annual DOT required", dueDate: new Date("2026-05-20") } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[22].id, title: "Mixer drum inspection", description: "Annual drum wear/bolt check", dueDate: new Date("2026-07-01") } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[27].id, title: "250hr service", description: "John Deere 8R scheduled interval", dueMileage: 1000 } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[30].id, title: "Pre-harvest prep", description: "X9 1100 combine full inspection before harvest", dueDate: new Date("2026-08-15") } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[32].id, title: "Blade edge replacement", description: "Check wear on cutting edge", dueMileage: 6500, isCompleted: true } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[34].id, title: "Undercarriage inspection", description: "2000hr interval for track chain inspection", dueMileage: 2000 } }),
    prisma.reminder.create({ data: { vehicleId: vehicles[38].id, title: "OSHA crane certification", description: "Annual load test and certification due", dueDate: new Date("2026-05-01") } }),
  ]);
  console.log(`  Created ${additionalReminders.length} additional reminders`);

  // -- Vehicle Findings (observations from service) --
  console.log("\nCreating vehicle findings...");
  const findings = await Promise.all([
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[4].id, description: "Front brake pads at 3mm, recommend replacement within 5,000 miles", severity: "needs_work", status: "open", serviceRecordId: serviceRecords[1].id, notes: "Customer informed during 50K service. Quoted separately.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[5].id, description: "CV boot torn on driver side, grease leaking onto suspension components", severity: "urgent", status: "open", notes: "Needs attention soon - will fail CV joint if not addressed.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[1].id, description: "Slight oil seepage from valve cover gasket, monitor at next service", severity: "monitor", status: "open", serviceRecordId: serviceRecords[19].id, notes: "Not dripping yet - just damp. Re-check in 6 months.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[8].id, description: "Battery testing at 78% capacity, recommend replacement before winter", severity: "monitor", status: "open", notes: "Still starts reliably. Load test shows degraded CCA.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[2].id, description: "Tire tread below 4/32 on front tires, will need replacement soon", severity: "needs_work", status: "open", notes: "Rears still have 6/32. Recommend rotating and planning fronts soon.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[9].id, description: "Coolant appears contaminated with oil traces, consider flush and inspection", severity: "needs_work", status: "open", serviceRecordId: serviceRecords[13].id, notes: "Found during turbo job. May be related to oil cooler seal.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[11].id, description: "Death wobble symptoms reported - track bar bushings worn", severity: "urgent", status: "resolved", notes: "Customer reported highway death wobble. Replaced steering stabilizer and tie rods.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[13].id, description: "Rear tire wear uneven - alignment suspected after track use", severity: "needs_work", status: "open", serviceRecordId: serviceRecords[3].id, notes: "Right rear shows inner edge wear consistent with toe-out.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[18].id, description: "DEF tank heater intermittent - low DEF temperature warning in cold weather", severity: "monitor", status: "open", serviceRecordId: serviceRecords[4].id, notes: "Only acts up below 20F. Monitor and replace if it fails completely.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[20].id, description: "Charge air cooler pipe cracked, boost leak confirmed", severity: "urgent", status: "open", notes: "Part ordered. Causing low-power complaint from driver.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[21].id, description: "Dump body floor showing stress cracks near rear hinge", severity: "needs_work", status: "open", notes: "Will need weld repair within 10,000 miles to avoid structural failure.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[24].id, description: "Front loader pins showing excessive play, bushings worn", severity: "needs_work", status: "open", notes: "Noticeable play when boom is fully extended. Replace at next service.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[25].id, description: "A/C condenser fins damaged, reduced cooling efficiency", severity: "monitor", status: "open", notes: "Fins bent from field debris. Combing/straightening recommended.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[31].id, description: "Left blade cylinder showing slow seepage at rod seal", severity: "monitor", status: "resolved", serviceRecordId: serviceRecords[8].id, resolvedServiceRecordId: serviceRecords[8].id, notes: "Resealed during Sept 2025 hydraulic overhaul.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[33].id, description: "Boom cylinder showing 2 inch drift over 10 minutes under load", severity: "needs_work", status: "open", notes: "Cylinder reseal scheduled in unassigned work.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[34].id, description: "Track shoe bolts loosening, retorque recommended", severity: "monitor", status: "open", notes: "Checked 8 of 42 shoes - 3 required retorque. Full inspection next service.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[38].id, description: "Right rear outrigger extending slower than left", severity: "needs_work", status: "open", notes: "Likely valve or cylinder seal. Scheduled for inspection.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[26].id, description: "Overheating under heavy PTO load - radiator partially blocked with chaff", severity: "needs_work", status: "open", notes: "Cleaned out what we could. Recommend pull radiator for deep clean.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[36].id, description: "Hydraulic hose chafing against frame rail near pivot point", severity: "needs_work", status: "open", notes: "Protective sleeve worn through. Will fail if not rerouted.", imageUrls: [] } }),
    prisma.vehicleFinding.create({ data: { vehicleId: vehicles[16].id, description: "Leaf spring bushings dry and cracking, suspension noise reported", severity: "needs_work", status: "open", notes: "Customer scheduled for leaf spring replacement.", imageUrls: [] } }),
  ]);
  console.log(`  Created ${findings.length} vehicle findings`);

  // -- Repeat service history for predicted maintenance --
  // Pick 6 vehicles, give each 3-4 completed service records with increasing mileage
  // spanning 2-3 years so the predictedMaintenanceActions has regression data.
  console.log("\nCreating repeat service history for predicted maintenance...");
  type HistEntry = { offsetDays: number; mileage: number; title: string; desc: string; type: string; techName: string };
  const predMaintHistory: { vehicleId: string; entries: HistEntry[] }[] = [
    {
      vehicleId: vehicles[1].id, // Ford F-150 Lariat white (Summit Construction, current 42300)
      entries: [
        { offsetDays: -820, mileage: 10500, title: "F-150 - 10K Oil Change",       desc: "First service. Synthetic 5W-30, oil filter, tire rotation.",     type: "maintenance", techName: "Jake Wilson" },
        { offsetDays: -540, mileage: 20200, title: "F-150 - 20K Service",          desc: "Oil change, cabin filter, brake inspection, tire rotation.",     type: "maintenance", techName: "Jake Wilson" },
        { offsetDays: -280, mileage: 30100, title: "F-150 - 30K Major Service",    desc: "Full fluid service, spark plugs, transfer case fluid.",          type: "maintenance", techName: "Chris Taylor" },
        { offsetDays: -90,  mileage: 40800, title: "F-150 - 40K Service",          desc: "Oil change, brake fluid flush, differential service.",           type: "maintenance", techName: "Jake Wilson" },
      ],
    },
    {
      vehicleId: vehicles[4].id, // BMW 330i xDrive (Sarah Coleman, current 55200)
      entries: [
        { offsetDays: -900, mileage: 22000, title: "BMW 330i - 22K Oil Service",   desc: "OEM oil, filter, inspection. OEM parts only per customer.",      type: "maintenance", techName: "Chris Taylor" },
        { offsetDays: -600, mileage: 32500, title: "BMW 330i - 32K Service",       desc: "Oil, cabin filter, brake inspection. All OEM BMW parts.",        type: "maintenance", techName: "Chris Taylor" },
        { offsetDays: -300, mileage: 43800, title: "BMW 330i - 43K Service",       desc: "Oil change, tire rotation, 4-wheel alignment.",                  type: "maintenance", techName: "Chris Taylor" },
      ],
    },
    {
      vehicleId: vehicles[5].id, // Honda Civic Sport (Amanda Foster, current 67800)
      entries: [
        { offsetDays: -960, mileage: 28500, title: "Civic - 28K Oil Change",       desc: "Synthetic oil, filter, tire rotation.",                          type: "maintenance", techName: "Jake Wilson" },
        { offsetDays: -680, mileage: 39200, title: "Civic - 39K Service",          desc: "Oil change, cabin filter, engine air filter.",                   type: "maintenance", techName: "Jake Wilson" },
        { offsetDays: -360, mileage: 52000, title: "Civic - 52K Major Service",    desc: "Oil, coolant flush, transmission fluid, belt inspection.",       type: "maintenance", techName: "Sofia Andersen" },
        { offsetDays: -110, mileage: 64500, title: "Civic - 64K Service",          desc: "Oil change, brake pad inspection, alignment check.",             type: "maintenance", techName: "Jake Wilson" },
      ],
    },
    {
      vehicleId: vehicles[8].id, // Silverado 2500HD (Lisa Martinez, current 98400)
      entries: [
        { offsetDays: -850, mileage: 62000, title: "Silverado - 62K Oil Service",  desc: "Duramax diesel oil, fuel filters, DEF top-off.",                 type: "maintenance", techName: "Marcus Reed" },
        { offsetDays: -560, mileage: 75500, title: "Silverado - 75K Service",      desc: "Oil, fuel filters, DEF fluid, tire rotation.",                   type: "maintenance", techName: "Marcus Reed" },
        { offsetDays: -290, mileage: 87200, title: "Silverado - 87K Major Service", desc: "Oil, coolant flush, transmission service, DPF regen.",          type: "maintenance", techName: "Marcus Reed" },
        { offsetDays: -60,  mileage: 96100, title: "Silverado - 96K Service",      desc: "Oil change, fuel filter, brake inspection.",                     type: "maintenance", techName: "Jake Wilson" },
      ],
    },
    {
      vehicleId: vehicles[18].id, // Kenworth T680 (Pacific Freight, current 185000)
      entries: [
        { offsetDays: -780, mileage: 92000,  title: "Kenworth - 92K PM",           desc: "Full PM - oil, fuel filters, air filters, inspection.",          type: "maintenance", techName: "Marcus Reed" },
        { offsetDays: -520, mileage: 118000, title: "Kenworth - 118K PM",          desc: "Engine oil, all filters, DEF, grease service.",                  type: "maintenance", techName: "Marcus Reed" },
        { offsetDays: -260, mileage: 148000, title: "Kenworth - 148K PM",          desc: "Engine oil, all filters, coolant check, brake adjust.",          type: "maintenance", techName: "Marcus Reed" },
      ],
    },
    {
      vehicleId: vehicles[16].id, // Tacoma TRD Off-Road (Lisa Martinez, current 31200)
      entries: [
        { offsetDays: -790, mileage: 8500,  title: "Tacoma - 8K Oil Change",       desc: "First service. Synthetic oil, filter, tire rotation.",           type: "maintenance", techName: "Jake Wilson" },
        { offsetDays: -520, mileage: 15800, title: "Tacoma - 15K Service",         desc: "Oil change, cabin filter, brake inspection.",                    type: "maintenance", techName: "Jake Wilson" },
        { offsetDays: -250, mileage: 24200, title: "Tacoma - 24K Service",         desc: "Oil, tire rotation, differential fluid check.",                  type: "maintenance", techName: "Erik Haugen" },
      ],
    },
  ];

  const today = new Date("2026-04-05");
  const predMaintRecords = [];
  for (const hist of predMaintHistory) {
    for (const entry of hist.entries) {
      const serviceDate = new Date(today);
      serviceDate.setDate(serviceDate.getDate() + entry.offsetDays);
      const rec = await prisma.serviceRecord.create({
        data: {
          vehicleId: hist.vehicleId,
          title: entry.title,
          description: entry.desc,
          type: entry.type,
          status: "completed",
          serviceDate,
          mileage: entry.mileage,
          techName: entry.techName,
          shopName: "Egeland Auto",
          subtotal: 180,
          taxRate: 8,
          taxAmount: 14.40,
          totalAmount: 194.40,
          cost: 194.40,
          partItems: { create: [{ name: "Synthetic Oil (5qt)", partNumber: "OIL-SYN-5Q", quantity: 1, unitPrice: 45, total: 45 }, { name: "Oil Filter", partNumber: "OF-UNI", quantity: 1, unitPrice: 12, total: 12 }] },
          laborItems: { create: [{ description: "Service and inspection", hours: 1.2, rate: 102.50, total: 123 }] },
        },
      });
      predMaintRecords.push(rec);
    }
  }
  console.log(`  Created ${predMaintRecords.length} historical service records across ${predMaintHistory.length} vehicles`);

  // Enable predicted maintenance feature setting
  console.log("\nEnabling predicted maintenance feature...");
  await Promise.all([
    prisma.appSetting.upsert({
      where: { organizationId_key: { organizationId: ORG_ID, key: "maintenance.enabled" } },
      create: { organizationId: ORG_ID, key: "maintenance.enabled", value: "true", userId: USER_ID },
      update: { value: "true" },
    }),
    prisma.appSetting.upsert({
      where: { organizationId_key: { organizationId: ORG_ID, key: "maintenance.serviceInterval" } },
      create: { organizationId: ORG_ID, key: "maintenance.serviceInterval", value: "15000", userId: USER_ID },
      update: { value: "15000" },
    }),
    prisma.appSetting.upsert({
      where: { organizationId_key: { organizationId: ORG_ID, key: "maintenance.approachingThreshold" } },
      create: { organizationId: ORG_ID, key: "maintenance.approachingThreshold", value: "1000", userId: USER_ID },
      update: { value: "1000" },
    }),
  ]);
  console.log("  Enabled predicted maintenance (interval: 15,000 mi, approaching: 1,000 mi)");

  // -- SMS Messages --
  console.log("\nCreating SMS messages...");
  const shopNumber = "+15551234567";
  await Promise.all([
    prisma.smsMessage.create({ data: { direction: "outbound", fromNumber: shopNumber, toNumber: "+15551002000", body: "Hi Summit Construction, your Ford F-150 (CO-4455) transmission flush is complete. Total: $689.04. Ready for pickup.", status: "delivered", organizationId: ORG_ID, customerId: customers[0].id } }),
    prisma.smsMessage.create({ data: { direction: "inbound", fromNumber: "+15551002000", toNumber: shopNumber, body: "Thanks! We'll send someone before 4pm. Can you look at the D6 bulldozer next week? Blade cylinder is leaking again.", status: "received", organizationId: ORG_ID, customerId: customers[0].id, createdAt: new Date(Date.now() - 3500000) } }),
    prisma.smsMessage.create({ data: { direction: "outbound", fromNumber: shopNumber, toNumber: "+15551002000", body: "Absolutely, we can fit the D6 in on Tuesday. We'll order the seal kit ahead of time.", status: "delivered", organizationId: ORG_ID, customerId: customers[0].id, createdAt: new Date(Date.now() - 3400000) } }),
    prisma.smsMessage.create({ data: { direction: "outbound", fromNumber: shopNumber, toNumber: "+15552013344", body: "Hi James, your Toyota Camry is due for its 30K service. We have Thursday or Friday availability.", status: "delivered", organizationId: ORG_ID, customerId: customers[1].id, createdAt: new Date(Date.now() - 86400000) } }),
    prisma.smsMessage.create({ data: { direction: "inbound", fromNumber: "+15552013344", toNumber: shopNumber, body: "Thursday morning works. Synthetic oil like last time please.", status: "received", organizationId: ORG_ID, customerId: customers[1].id, createdAt: new Date(Date.now() - 82800000) } }),
    prisma.smsMessage.create({ data: { direction: "outbound", fromNumber: shopNumber, toNumber: "+15552013344", body: "Thursday 8am confirmed. Full synthetic 0W-20 as always. See you then!", status: "delivered", organizationId: ORG_ID, customerId: customers[1].id, createdAt: new Date(Date.now() - 82000000) } }),
    prisma.smsMessage.create({ data: { direction: "inbound", fromNumber: "+15553025566", toNumber: shopNumber, body: "Our Volvo FH 640 (unit #5) is showing a check engine light. Can you get it in ASAP?", status: "received", organizationId: ORG_ID, customerId: customers[2].id, createdAt: new Date(Date.now() - 172800000) } }),
    prisma.smsMessage.create({ data: { direction: "outbound", fromNumber: shopNumber, toNumber: "+15553025566", body: "We can take the Volvo FH 640 first thing tomorrow. Have the driver bring it in by 7am.", status: "delivered", organizationId: ORG_ID, customerId: customers[2].id, createdAt: new Date(Date.now() - 172000000) } }),
    prisma.smsMessage.create({ data: { direction: "outbound", fromNumber: shopNumber, toNumber: "+15553025566", body: "Update on the Volvo FH 640: DOT inspection in progress. Minor issues with marker lights and wipers. Done by 3pm.", status: "delivered", organizationId: ORG_ID, customerId: customers[2].id, createdAt: new Date(Date.now() - 86400000) } }),
    prisma.smsMessage.create({ data: { direction: "inbound", fromNumber: "+15552101122", toNumber: shopNumber, body: "Our John Deere 6R is running rough and hydraulics feel sluggish. Planting season starts in 3 weeks!", status: "received", organizationId: ORG_ID, customerId: customers[10].id, createdAt: new Date(Date.now() - 432000000) } }),
    prisma.smsMessage.create({ data: { direction: "outbound", fromNumber: shopNumber, toNumber: "+15552101122", body: "Bring the John Deere 6R in this week, we'll bump it to priority. Likely needs 500hr service + hydraulic analysis.", status: "delivered", organizationId: ORG_ID, customerId: customers[10].id, createdAt: new Date(Date.now() - 428400000) } }),
    prisma.smsMessage.create({ data: { direction: "inbound", fromNumber: "+15552101122", toNumber: shopNumber, body: "Great. The Massey Ferguson 8S has low hydraulic pressure too. Can you look at both?", status: "received", organizationId: ORG_ID, customerId: customers[10].id, createdAt: new Date(Date.now() - 424800000) } }),
    prisma.smsMessage.create({ data: { direction: "outbound", fromNumber: shopNumber, toNumber: "+15552101122", body: "Bring both Wednesday. JD done same day, Massey Thursday. Both ready before planting.", status: "delivered", organizationId: ORG_ID, customerId: customers[10].id, createdAt: new Date(Date.now() - 421200000) } }),
    prisma.smsMessage.create({ data: { direction: "outbound", fromNumber: shopNumber, toNumber: "+15557151122", body: "Kevin, your Sprinter turbo has excessive shaft play causing black smoke. Replacement: $1,280 + labor. Proceed?", status: "delivered", organizationId: ORG_ID, customerId: customers[15].id, createdAt: new Date(Date.now() - 345600000) } }),
    prisma.smsMessage.create({ data: { direction: "inbound", fromNumber: "+15557151122", toNumber: shopNumber, body: "Ouch. Yeah go ahead, I need the van for catering events next week.", status: "received", organizationId: ORG_ID, customerId: customers[15].id, createdAt: new Date(Date.now() - 342000000) } }),
    prisma.smsMessage.create({ data: { direction: "outbound", fromNumber: shopNumber, toNumber: "+15557151122", body: "Parts arrive Thursday, done Friday afternoon. Total: $2,243.70 including oil change.", status: "delivered", organizationId: ORG_ID, customerId: customers[15].id, createdAt: new Date(Date.now() - 338400000) } }),
    prisma.smsMessage.create({ data: { direction: "outbound", fromNumber: shopNumber, toNumber: "+15559087788", body: "Ridgeline, the Komatsu PC210 track chains are done. Both sides + new sprockets. Total: $9,309.60. Ready for transport.", status: "delivered", organizationId: ORG_ID, customerId: customers[8].id, createdAt: new Date(Date.now() - 604800000) } }),
    prisma.smsMessage.create({ data: { direction: "inbound", fromNumber: "+15559087788", toNumber: shopNumber, body: "Excellent work. Sending the lowboy tomorrow. Also sending the Volvo EC220E for 1000hr service.", status: "received", organizationId: ORG_ID, customerId: customers[8].id, createdAt: new Date(Date.now() - 601200000) } }),
    prisma.smsMessage.create({ data: { direction: "outbound", fromNumber: shopNumber, toNumber: "+15559087788", body: "We have Volvo EC220E filters in stock. 1-2 day turnaround once it arrives.", status: "delivered", organizationId: ORG_ID, customerId: customers[8].id, createdAt: new Date(Date.now() - 597600000) } }),
    prisma.smsMessage.create({ data: { direction: "outbound", fromNumber: shopNumber, toNumber: "+15554037788", body: "Hi Sarah, your Porsche 911 annual service is complete. Total: $832.14. All OEM parts as always.", status: "delivered", organizationId: ORG_ID, customerId: customers[3].id, createdAt: new Date(Date.now() - 259200000) } }),
    prisma.smsMessage.create({ data: { direction: "inbound", fromNumber: "+15554037788", toNumber: shopNumber, body: "Perfect, thank you. I also want to get a quote on the BMW brake job with OEM rotors.", status: "received", organizationId: ORG_ID, customerId: customers[3].id, createdAt: new Date(Date.now() - 255600000) } }),
    prisma.smsMessage.create({ data: { direction: "outbound", fromNumber: shopNumber, toNumber: "+15554037788", body: "Quote sent to your email - $1,711.80 for the full brake overhaul with OEM rotors and pads. Valid until March 15.", status: "delivered", organizationId: ORG_ID, customerId: customers[3].id, createdAt: new Date(Date.now() - 254000000) } }),
  ]);
  console.log("  Created 22 SMS messages");

  // -- Technicians & Work Board --
  console.log("\nCreating technicians...");
  // Clean up existing workboard data
  await prisma.technician.deleteMany({ where: { organizationId: ORG_ID } });

  const technicians = await Promise.all([
    prisma.technician.create({ data: { name: "Jake Wilson", color: "#3b82f6", sortOrder: 0, organizationId: ORG_ID } }),
    prisma.technician.create({ data: { name: "Chris Taylor", color: "#22c55e", sortOrder: 1, organizationId: ORG_ID } }),
    prisma.technician.create({ data: { name: "Marcus Reed", color: "#f59e0b", sortOrder: 2, organizationId: ORG_ID } }),
    prisma.technician.create({ data: { name: "Sofia Andersen", color: "#ec4899", sortOrder: 3, organizationId: ORG_ID } }),
    prisma.technician.create({ data: { name: "Erik Haugen", color: "#8b5cf6", sortOrder: 4, organizationId: ORG_ID } }),
    prisma.technician.create({ data: { name: "Lars Johansen", color: "#06b6d4", sortOrder: 5, organizationId: ORG_ID } }),
    prisma.technician.create({ data: { name: "Nina Berglund", color: "#f97316", sortOrder: 6, organizationId: ORG_ID } }),
    prisma.technician.create({ data: { name: "Tom Bradley", color: "#14b8a6", sortOrder: 7, organizationId: ORG_ID } }),
    prisma.technician.create({ data: { name: "Kari Moen", color: "#a855f7", sortOrder: 8, organizationId: ORG_ID } }),
    prisma.technician.create({ data: { name: "Daniel Eriksen", color: "#ef4444", sortOrder: 9, organizationId: ORG_ID } }),
    // Demo Owner (index 10) — linked to the demo user so dashboard "My Active Jobs" populates
    prisma.technician.create({ data: { name: "Demo Owner", color: "#0ea5e9", sortOrder: 10, organizationId: ORG_ID, userId: USER_ID } }),
  ]);
  console.log(`  Created ${technicians.length} technicians`);

  // Board assignments - spread across the current week
  console.log("\nCreating board assignments...");
  // Anchor to 2026-03-09 (Monday) so the work board day view looks great
  const monday = new Date("2026-03-09T00:00:00");
  const day = (offset: number) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + offset);
    return d;
  };
  // Helper: create a datetime on a given day offset at a specific hour:minute
  const dt = (dayOffset: number, hour: number, minute = 0) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  // Helper to create service record with parts + labor
  const sr = (base: Record<string, unknown>, parts: { name: string; partNumber: string; quantity: number; unitPrice: number; total: number }[], labor: { description: string; hours: number; rate: number; total: number }[], notes?: string) => {
    const subtotal = parts.reduce((s, p) => s + p.total, 0) + labor.reduce((s, l) => s + l.total, 0);
    const taxAmount = Math.round(subtotal * 0.08 * 100) / 100;
    return prisma.serviceRecord.create({ data: { ...base, subtotal, taxRate: 8, taxAmount, totalAmount: subtotal + taxAmount, cost: subtotal + taxAmount, diagnosticNotes: notes || null, partItems: { create: parts }, laborItems: { create: labor } } as never });
  };

  // Create service records for the board (assigned ones)
  const boardServiceRecords = await Promise.all([
    // 0: Honda Civic AC
    sr({ vehicleId: vehicles[5].id, title: "Honda Civic - AC Compressor", description: "AC not blowing cold. Compressor clutch not engaging.", type: "repair", status: "pending", serviceDate: day(0), mileage: 45200, techName: "Jake Wilson", shopName: "Egeland Auto" },
      [{ name: "AC Compressor Assembly", partNumber: "HON-ACC-10G", quantity: 1, unitPrice: 480, total: 480 }, { name: "Refrigerant R-134a (2 cans)", partNumber: "REF-134A-2", quantity: 1, unitPrice: 45, total: 45 }],
      [{ description: "AC compressor removal and replacement", hours: 2.5, rate: 110, total: 275 }, { description: "System evacuate, recharge and leak test", hours: 1.0, rate: 110, total: 110 }],
      "Compressor clutch not engaging. Checked voltage at clutch connector - 12V present. Clutch coil resistance out of spec. Replace compressor assembly."),
    // 1: Audi A4 timing belt
    sr({ vehicleId: vehicles[10].id, title: "Audi A4 - Timing Belt Service", description: "Scheduled timing belt and water pump replacement at 60K miles.", type: "maintenance", status: "scheduled", serviceDate: day(0), mileage: 60000, techName: "Chris Taylor", shopName: "Egeland Auto" },
      [{ name: "Timing Belt Kit w/ Water Pump", partNumber: "AUD-TBK-A4", quantity: 1, unitPrice: 385, total: 385 }, { name: "Thermostat Assembly", partNumber: "AUD-TH-A4", quantity: 1, unitPrice: 65, total: 65 }, { name: "Coolant G13 (5L)", partNumber: "AUD-COOL-G13", quantity: 1, unitPrice: 42, total: 42 }],
      [{ description: "Timing belt and water pump replacement", hours: 4.5, rate: 120, total: 540 }, { description: "Coolant flush and bleed", hours: 1.0, rate: 120, total: 120 }]),
    // 2: Tesla Model Y suspension
    sr({ vehicleId: vehicles[7].id, title: "Tesla Model Y - Suspension Noise", description: "Customer reports clunking from front left over bumps.", type: "repair", status: "pending", serviceDate: day(1), mileage: 32000, techName: "Sofia Andersen", shopName: "Egeland Auto" },
      [{ name: "Front Lower Control Arm (L)", partNumber: "TES-LCA-MY-L", quantity: 1, unitPrice: 290, total: 290 }],
      [{ description: "Diagnose suspension noise", hours: 0.5, rate: 110, total: 55 }, { description: "Control arm replacement and alignment", hours: 2.0, rate: 110, total: 220 }],
      "Play found in front left lower control arm ball joint. No other issues found. Recommend alignment after replacement."),
    // 3: Silverado 60K
    sr({ vehicleId: vehicles[8].id, title: "Silverado - 60K Service", description: "60,000 mile major service. Transmission fluid, spark plugs, coolant flush.", type: "maintenance", status: "scheduled", serviceDate: day(1), mileage: 60000, techName: "Jake Wilson", shopName: "Egeland Auto" },
      [{ name: "ATF Dexron VI (12qt)", partNumber: "GM-ATF-DEX6", quantity: 1, unitPrice: 120, total: 120 }, { name: "Spark Plugs ACDelco (8)", partNumber: "ACD-SP-53", quantity: 8, unitPrice: 12, total: 96 }, { name: "Coolant Dex-Cool (2gal)", partNumber: "GM-COOL-DC", quantity: 1, unitPrice: 38, total: 38 }],
      [{ description: "Transmission fluid exchange", hours: 1.5, rate: 110, total: 165 }, { description: "Spark plug replacement (V8)", hours: 1.5, rate: 110, total: 165 }, { description: "Coolant flush and refill", hours: 1.0, rate: 110, total: 110 }]),
    // 4: Tacoma leaf springs
    sr({ vehicleId: vehicles[17].id, title: "Toyota Tacoma - Leaf Spring Replacement", description: "Rear leaf springs sagging. Replace with upgraded OEM springs.", type: "repair", status: "pending", serviceDate: day(1), mileage: 55000, techName: "Erik Haugen", shopName: "Egeland Auto" },
      [{ name: "Rear Leaf Spring Pack (pair)", partNumber: "TOY-LS-TAC", quantity: 1, unitPrice: 520, total: 520 }, { name: "U-Bolt Kit", partNumber: "TOY-UB-TAC", quantity: 1, unitPrice: 85, total: 85 }],
      [{ description: "Leaf spring removal and installation (both sides)", hours: 3.5, rate: 110, total: 385 }]),
    // 5: Bobcat S650 annual
    sr({ vehicleId: vehicles[34].id, title: "Bobcat S650 - Annual Service", description: "Full annual service. Engine oil, hydraulic filters, drive belt.", type: "maintenance", status: "scheduled", serviceDate: day(2), mileage: 2200, techName: "Marcus Reed", shopName: "Egeland Auto" },
      [{ name: "Engine Oil 15W-40 (2gal)", partNumber: "BOB-15W40-2G", quantity: 1, unitPrice: 68, total: 68 }, { name: "Oil Filter", partNumber: "BOB-OF-S650", quantity: 1, unitPrice: 22, total: 22 }, { name: "Hydraulic Filter Set", partNumber: "BOB-HFS-S650", quantity: 1, unitPrice: 95, total: 95 }, { name: "Drive Belt", partNumber: "BOB-DB-S650", quantity: 1, unitPrice: 48, total: 48 }],
      [{ description: "Engine oil and filter change", hours: 1.0, rate: 130, total: 130 }, { description: "Hydraulic filter replacement", hours: 1.0, rate: 130, total: 130 }, { description: "Drive belt inspection and replacement", hours: 0.5, rate: 130, total: 65 }]),
    // 6: CAT 745 transmission rebuild
    sr({ vehicleId: vehicles[36].id, title: "CAT 745 - Transmission Rebuild", description: "Slipping in 3rd gear under load. Full transmission rebuild.", type: "repair", status: "in_progress", serviceDate: day(0), mileage: 8500, techName: "Marcus Reed", shopName: "Egeland Auto" },
      [{ name: "Transmission Rebuild Kit", partNumber: "CAT-TRK-745", quantity: 1, unitPrice: 4200, total: 4200 }, { name: "Torque Converter", partNumber: "CAT-TC-745", quantity: 1, unitPrice: 2800, total: 2800 }, { name: "Transmission Oil (20gal)", partNumber: "CAT-TO-20G", quantity: 1, unitPrice: 480, total: 480 }],
      [{ description: "Transmission removal", hours: 8.0, rate: 150, total: 1200 }, { description: "Rebuild and reassembly", hours: 16.0, rate: 150, total: 2400 }, { description: "Installation and calibration", hours: 6.0, rate: 150, total: 900 }],
      "3rd gear clutch pack worn beyond spec. Torque converter showing excessive slip. Full rebuild recommended over clutch pack only due to hours on unit."),
    // 7: F-150 exhaust
    sr({ vehicleId: vehicles[3].id, title: "Ford F-150 - Exhaust Leak Repair", description: "Exhaust manifold gasket leak. Replace gasket and inspect cat.", type: "repair", status: "pending", serviceDate: day(2), mileage: 52000, techName: "Jake Wilson", shopName: "Egeland Auto" },
      [{ name: "Exhaust Manifold Gasket Set", partNumber: "FORD-EMG-5L", quantity: 1, unitPrice: 85, total: 85 }, { name: "Exhaust Manifold Bolts (set)", partNumber: "FORD-EMB-5L", quantity: 1, unitPrice: 42, total: 42 }],
      [{ description: "Manifold removal and gasket replacement", hours: 2.5, rate: 110, total: 275 }, { description: "Cat converter inspection", hours: 0.5, rate: 110, total: 55 }]),
    // 8: Freightliner air brakes
    sr({ vehicleId: vehicles[19].id, title: "Freightliner - Air Brake Overhaul", description: "Brake chambers, slack adjusters, and air dryer service.", type: "repair", status: "scheduled", serviceDate: day(3), mileage: 210000, techName: "Erik Haugen", shopName: "Egeland Auto" },
      [{ name: "Brake Chamber (pair)", partNumber: "FRT-BC-CAS", quantity: 2, unitPrice: 320, total: 640 }, { name: "Automatic Slack Adjuster (pair)", partNumber: "FRT-ASA-CAS", quantity: 2, unitPrice: 185, total: 370 }, { name: "Air Dryer Cartridge", partNumber: "FRT-ADC-CAS", quantity: 1, unitPrice: 120, total: 120 }],
      [{ description: "Brake chamber replacement (both axles)", hours: 4.0, rate: 140, total: 560 }, { description: "Slack adjuster replacement", hours: 2.0, rate: 140, total: 280 }, { description: "Air dryer service and system test", hours: 1.5, rate: 140, total: 210 }]),
    // 9: Ram transfer case
    sr({ vehicleId: vehicles[16].id, title: "Ram 1500 - Transfer Case Service", description: "Transfer case fluid change. Customer reports 4WD engagement delay.", type: "maintenance", status: "pending", serviceDate: day(3), mileage: 45000, techName: "Sofia Andersen", shopName: "Egeland Auto" },
      [{ name: "Transfer Case Fluid (2qt)", partNumber: "RAM-TCF-2Q", quantity: 1, unitPrice: 48, total: 48 }, { name: "Transfer Case Drain Plug Gasket", partNumber: "RAM-DPG-TC", quantity: 1, unitPrice: 8, total: 8 }],
      [{ description: "Transfer case fluid drain and refill", hours: 1.0, rate: 110, total: 110 }, { description: "4WD engagement test and inspection", hours: 0.5, rate: 110, total: 55 }],
      "Fluid was dark and slightly burnt. Delay was from low fluid level. Refilled and tested - engages promptly now. Monitor."),
    // 10: Combine pre-season
    sr({ vehicleId: vehicles[29].id, title: "Combine Harvester - Pre-Season Prep", description: "Full pre-season inspection. Header, feeder chain, sieve adjustments, all fluids.", type: "maintenance", status: "scheduled", serviceDate: day(4), mileage: 2800, techName: "Marcus Reed", shopName: "Egeland Auto" },
      [{ name: "Engine Oil 15W-40 (5gal)", partNumber: "CMB-15W40-5G", quantity: 1, unitPrice: 185, total: 185 }, { name: "Hydraulic Filter Set", partNumber: "CMB-HFS", quantity: 1, unitPrice: 110, total: 110 }, { name: "Feeder Chain", partNumber: "CMB-FC-1", quantity: 1, unitPrice: 380, total: 380 }, { name: "Sieve Section (2)", partNumber: "CMB-SS-2", quantity: 2, unitPrice: 145, total: 290 }],
      [{ description: "Engine oil and filter change", hours: 1.5, rate: 140, total: 210 }, { description: "Feeder chain replacement", hours: 2.5, rate: 140, total: 350 }, { description: "Sieve adjustment and replacement", hours: 2.0, rate: 140, total: 280 }, { description: "Full system inspection and grease", hours: 2.0, rate: 140, total: 280 }]),
    // 11: Jeep axle seal
    sr({ vehicleId: vehicles[12].id, title: "Jeep Wrangler - Axle Seal Replacement", description: "Rear axle seal leaking. Replace seals and check diff fluid.", type: "repair", status: "pending", serviceDate: day(4), mileage: 62000, techName: "Chris Taylor", shopName: "Egeland Auto" },
      [{ name: "Rear Axle Seal Kit", partNumber: "JEEP-ASK-JL", quantity: 1, unitPrice: 65, total: 65 }, { name: "Differential Fluid 75W-140 (2.5qt)", partNumber: "JEEP-DF-75W", quantity: 1, unitPrice: 52, total: 52 }],
      [{ description: "Axle seal replacement (both sides)", hours: 2.5, rate: 110, total: 275 }, { description: "Differential fluid top-off and inspection", hours: 0.5, rate: 110, total: 55 }]),
    // 12: Ram oil change (Lars)
    sr({ vehicleId: vehicles[15].id, title: "Ram 1500 - Oil Change & Inspection", description: "Regular 10K mile service. Check brakes and tires.", type: "maintenance", status: "scheduled", serviceDate: day(0), mileage: 30000, techName: "Lars Johansen", shopName: "Egeland Auto" },
      [{ name: "Engine Oil 5W-20 (7qt)", partNumber: "RAM-5W20-7Q", quantity: 1, unitPrice: 52, total: 52 }, { name: "Oil Filter", partNumber: "RAM-OF-HEMI", quantity: 1, unitPrice: 14, total: 14 }],
      [{ description: "Oil and filter change", hours: 0.5, rate: 110, total: 55 }, { description: "Brake and tire inspection", hours: 0.5, rate: 110, total: 55 }]),
    // 13: F-150 wheel bearing (Nina)
    sr({ vehicleId: vehicles[2].id, title: "Ford F-150 - Wheel Bearing", description: "Front left wheel bearing noise. Replace bearing assembly.", type: "repair", status: "pending", serviceDate: day(1), mileage: 68000, techName: "Nina Berglund", shopName: "Egeland Auto" },
      [{ name: "Front Wheel Bearing Hub Assembly", partNumber: "FORD-WBH-F150", quantity: 1, unitPrice: 285, total: 285 }],
      [{ description: "Wheel bearing hub replacement", hours: 2.0, rate: 110, total: 220 }, { description: "Road test and verify", hours: 0.5, rate: 110, total: 55 }],
      "Confirmed bearing noise from front left. Bearing has play when checked on lift. Right side OK for now."),
    // 14: Concrete mixer (Tom)
    sr({ vehicleId: vehicles[22].id, title: "Concrete Mixer - Drum Motor Service", description: "Hydraulic motor service for drum rotation. Sluggish under load.", type: "repair", status: "in_progress", serviceDate: day(0), mileage: 75000, techName: "Tom Bradley", shopName: "Egeland Auto" },
      [{ name: "Hydraulic Motor Seal Kit", partNumber: "MIX-HMSK", quantity: 1, unitPrice: 280, total: 280 }, { name: "Hydraulic Oil ISO 46 (10gal)", partNumber: "HYD-ISO46-10G", quantity: 1, unitPrice: 180, total: 180 }, { name: "Hydraulic Hose Assembly", partNumber: "MIX-HHA-12", quantity: 2, unitPrice: 95, total: 190 }],
      [{ description: "Hydraulic motor removal and reseal", hours: 4.0, rate: 140, total: 560 }, { description: "Hose replacement and system flush", hours: 2.0, rate: 140, total: 280 }, { description: "Load test drum rotation", hours: 1.0, rate: 140, total: 140 }]),
    // 15: Tractor PTO (Kari)
    sr({ vehicleId: vehicles[27].id, title: "Tractor - PTO Clutch Adjustment", description: "PTO slipping under heavy load. Adjust clutch pack and inspect.", type: "repair", status: "pending", serviceDate: day(2), mileage: 3200, techName: "Kari Moen", shopName: "Egeland Auto" },
      [{ name: "PTO Clutch Friction Disc Set", partNumber: "TRC-PTO-FDS", quantity: 1, unitPrice: 165, total: 165 }],
      [{ description: "PTO clutch pack inspection and adjustment", hours: 2.0, rate: 130, total: 260 }],
      "Clutch pack within adjustment range. Adjusted gap to spec. If slipping persists, full clutch pack replacement needed."),
    // 16: Dump truck tailgate (Daniel)
    sr({ vehicleId: vehicles[23].id, title: "Dump Truck - Tailgate Cylinder", description: "Tailgate cylinder leaking. Reseal and test.", type: "repair", status: "scheduled", serviceDate: day(1), mileage: 120000, techName: "Daniel Eriksen", shopName: "Egeland Auto" },
      [{ name: "Tailgate Cylinder Seal Kit", partNumber: "DMP-TCSK", quantity: 1, unitPrice: 145, total: 145 }, { name: "Hydraulic Oil ISO 46 (5gal)", partNumber: "HYD-ISO46-5G", quantity: 1, unitPrice: 95, total: 95 }],
      [{ description: "Cylinder removal and reseal", hours: 3.0, rate: 130, total: 390 }, { description: "Reinstall and cycle test", hours: 1.0, rate: 130, total: 130 }]),
    // 17: Forklift mast chain (Lars)
    sr({ vehicleId: vehicles[39].id, title: "Forklift - Mast Chain Replace", description: "Mast chain stretched beyond spec. Replace chains and adjust.", type: "repair", status: "pending", serviceDate: day(3), mileage: 5500, techName: "Lars Johansen", shopName: "Egeland Auto" },
      [{ name: "Mast Chain (pair)", partNumber: "FRK-MC-PAIR", quantity: 1, unitPrice: 420, total: 420 }, { name: "Chain Anchor Pins", partNumber: "FRK-CAP-4", quantity: 1, unitPrice: 35, total: 35 }],
      [{ description: "Mast chain removal and replacement", hours: 2.5, rate: 120, total: 300 }, { description: "Chain tension adjustment and mast alignment", hours: 1.0, rate: 120, total: 120 }]),
    // 18: VW Golf clutch (Nina)
    sr({ vehicleId: vehicles[14].id, title: "VW Golf GTI - Clutch Replace", description: "Clutch slipping at high RPM. Replace disc, pressure plate, throwout bearing.", type: "repair", status: "scheduled", serviceDate: day(2), mileage: 72000, techName: "Nina Berglund", shopName: "Egeland Auto" },
      [{ name: "Clutch Kit (disc, plate, bearing)", partNumber: "VW-CK-GTI", quantity: 1, unitPrice: 480, total: 480 }, { name: "Flywheel Bolts (set)", partNumber: "VW-FWB-GTI", quantity: 1, unitPrice: 32, total: 32 }],
      [{ description: "Transmission removal", hours: 3.5, rate: 120, total: 420 }, { description: "Clutch replacement and installation", hours: 2.5, rate: 120, total: 300 }, { description: "Bleed hydraulic clutch and road test", hours: 1.0, rate: 120, total: 120 }]),
    // 19: Combine header knives (Tom)
    sr({ vehicleId: vehicles[30].id, title: "Combine - Header Knife Sharpen", description: "Sharpen and replace worn header knives. 4 sections need new blades.", type: "maintenance", status: "pending", serviceDate: day(4), mileage: 2900, techName: "Tom Bradley", shopName: "Egeland Auto" },
      [{ name: "Header Knife Sections (pack of 10)", partNumber: "CMB-HKS-10", quantity: 1, unitPrice: 85, total: 85 }, { name: "Knife Rivets (50-pack)", partNumber: "CMB-KR-50", quantity: 1, unitPrice: 22, total: 22 }],
      [{ description: "Remove header knives", hours: 1.0, rate: 120, total: 120 }, { description: "Sharpen and replace worn sections", hours: 2.0, rate: 120, total: 240 }, { description: "Reinstall and test", hours: 1.0, rate: 120, total: 120 }]),
    // 20: Kenworth clutch (Kari)
    sr({ vehicleId: vehicles[18].id, title: "Kenworth T680 - Clutch Adjustment", description: "Driver reports clutch engagement point too high. Adjust and inspect.", type: "repair", status: "pending", serviceDate: day(3), mileage: 185000, techName: "Kari Moen", shopName: "Egeland Auto" },
      [{ name: "Clutch Adjustment Hardware", partNumber: "KW-CAH-T680", quantity: 1, unitPrice: 45, total: 45 }],
      [{ description: "Clutch linkage inspection and adjustment", hours: 1.5, rate: 140, total: 210 }, { description: "Road test under load", hours: 0.5, rate: 140, total: 70 }]),
    // 21: Jeep steering stabilizer (Daniel)
    sr({ vehicleId: vehicles[11].id, title: "Jeep Wrangler - Steering Stabilizer", description: "Death wobble at highway speed. Replace stabilizer and check tie rods.", type: "repair", status: "scheduled", serviceDate: day(4), mileage: 31000, techName: "Daniel Eriksen", shopName: "Egeland Auto" },
      [{ name: "Steering Stabilizer", partNumber: "JEEP-SS-JL", quantity: 1, unitPrice: 125, total: 125 }, { name: "Tie Rod End (pair)", partNumber: "JEEP-TRE-JL", quantity: 1, unitPrice: 140, total: 140 }],
      [{ description: "Steering stabilizer replacement", hours: 0.5, rate: 110, total: 55 }, { description: "Tie rod end inspection and replacement", hours: 1.5, rate: 110, total: 165 }]),
    // Friday extras (22–33)
    // 22: Camry cabin filter (Jake)
    sr({ vehicleId: vehicles[0].id, title: "Toyota Camry - Cabin Filter + Wipers", description: "Replace cabin air filter and wiper blades. Quick service.", type: "maintenance", status: "scheduled", serviceDate: day(4), mileage: 16500, techName: "Jake Wilson", shopName: "Egeland Auto" },
      [{ name: "Cabin Air Filter", partNumber: "TOY-CAF-CAM", quantity: 1, unitPrice: 22, total: 22 }, { name: "Wiper Blade Set (front)", partNumber: "TOY-WB-CAM", quantity: 1, unitPrice: 38, total: 38 }],
      [{ description: "Cabin filter and wiper replacement", hours: 0.3, rate: 95, total: 28.50 }]),
    // 23: Honda brakes (Jake)
    sr({ vehicleId: vehicles[5].id, title: "Honda Civic - Brake Pad Replace", description: "Front pads worn to 2mm. Replace front brake pads.", type: "repair", status: "pending", serviceDate: day(4), mileage: 46000, techName: "Jake Wilson", shopName: "Egeland Auto" },
      [{ name: "Front Brake Pad Set", partNumber: "HON-BP-CIV", quantity: 1, unitPrice: 85, total: 85 }, { name: "Brake Cleaner (2 cans)", partNumber: "BC-CLEAN-2", quantity: 1, unitPrice: 12, total: 12 }],
      [{ description: "Front brake pad replacement", hours: 1.0, rate: 95, total: 95 }, { description: "Brake inspection and road test", hours: 0.3, rate: 95, total: 28.50 }]),
    // 24: Silverado taillight (Jake)
    sr({ vehicleId: vehicles[8].id, title: "Silverado - Taillight Assembly", description: "Cracked right taillight from parking lot bump. Replace assembly.", type: "repair", status: "pending", serviceDate: day(4), mileage: 60500, techName: "Jake Wilson", shopName: "Egeland Auto" },
      [{ name: "Taillight Assembly (right)", partNumber: "GM-TLA-SIL-R", quantity: 1, unitPrice: 125, total: 125 }],
      [{ description: "Taillight assembly replacement", hours: 0.5, rate: 95, total: 47.50 }]),
    // 25: Sprinter oil (Chris)
    sr({ vehicleId: vehicles[9].id, title: "Sprinter - Oil Service + Inspection", description: "Regular oil change with full inspection. Check brake wear sensors.", type: "maintenance", status: "scheduled", serviceDate: day(4), mileage: 37000, techName: "Chris Taylor", shopName: "Egeland Auto" },
      [{ name: "Engine Oil 5W-30 (8qt)", partNumber: "MB-5W30-8Q", quantity: 1, unitPrice: 78, total: 78 }, { name: "Oil Filter", partNumber: "MB-OF-SPR", quantity: 1, unitPrice: 18, total: 18 }],
      [{ description: "Oil and filter change", hours: 0.5, rate: 110, total: 55 }, { description: "Multi-point inspection", hours: 1.0, rate: 110, total: 110 }]),
    // 26: BMW coolant (Chris)
    sr({ vehicleId: vehicles[4].id, title: "BMW 330i - Coolant Flush", description: "Coolant due. Flush and refill with BMW-approved coolant.", type: "maintenance", status: "scheduled", serviceDate: day(4), mileage: 52000, techName: "Chris Taylor", shopName: "Egeland Auto" },
      [{ name: "BMW Coolant Concentrate (2L)", partNumber: "BMW-COOL-2L", quantity: 2, unitPrice: 32, total: 64 }, { name: "Thermostat Gasket", partNumber: "BMW-TG-N20", quantity: 1, unitPrice: 12, total: 12 }],
      [{ description: "Coolant flush and refill", hours: 1.0, rate: 120, total: 120 }, { description: "Bleed cooling system", hours: 0.5, rate: 120, total: 60 }]),
    // 27: Ram alignment (Sofia)
    sr({ vehicleId: vehicles[15].id, title: "Ram 1500 - Alignment Check", description: "Pulling to the right after pothole. Full 4-wheel alignment.", type: "maintenance", status: "pending", serviceDate: day(4), mileage: 20000, techName: "Sofia Andersen", shopName: "Egeland Auto" },
      [],
      [{ description: "4-wheel alignment", hours: 1.0, rate: 110, total: 110 }]),
    // 28: Audi spark plugs (Sofia)
    sr({ vehicleId: vehicles[10].id, title: "Audi A4 - Spark Plug Replace", description: "Misfire on cylinder 2. Replace all 4 spark plugs.", type: "repair", status: "pending", serviceDate: day(4), mileage: 62000, techName: "Sofia Andersen", shopName: "Egeland Auto" },
      [{ name: "Spark Plugs NGK (set of 4)", partNumber: "AUD-SP-NGK4", quantity: 1, unitPrice: 68, total: 68 }, { name: "Ignition Coil (cyl 2)", partNumber: "AUD-IC-A4", quantity: 1, unitPrice: 52, total: 52 }],
      [{ description: "Spark plug replacement (4 cyl)", hours: 1.0, rate: 120, total: 120 }, { description: "Diagnose misfire and replace coil", hours: 0.5, rate: 120, total: 60 }],
      "P0302 - misfire cyl 2. Coil swap test confirmed faulty coil on cyl 2. Replace coil and all 4 plugs."),
    // 29: Tesla tire rotation (Sofia)
    sr({ vehicleId: vehicles[7].id, title: "Tesla Model Y - Tire Rotation", description: "Rotate tires front to rear. Check tread depth and tire pressure.", type: "maintenance", status: "scheduled", serviceDate: day(4), mileage: 33000, techName: "Sofia Andersen", shopName: "Egeland Auto" },
      [],
      [{ description: "Tire rotation front to rear", hours: 0.5, rate: 95, total: 47.50 }, { description: "Tread depth measurement and pressure set", hours: 0.2, rate: 95, total: 19 }]),
    // 30: Massey Ferguson radiator (Erik)
    sr({ vehicleId: vehicles[26].id, title: "Massey Ferguson - Radiator Flush", description: "Overheating under load. Flush radiator and check thermostat.", type: "maintenance", status: "pending", serviceDate: day(4), mileage: 3800, techName: "Erik Haugen", shopName: "Egeland Auto" },
      [{ name: "Coolant (5gal)", partNumber: "MF-COOL-5G", quantity: 1, unitPrice: 65, total: 65 }, { name: "Thermostat", partNumber: "MF-TH-8S", quantity: 1, unitPrice: 48, total: 48 }],
      [{ description: "Radiator flush and refill", hours: 1.5, rate: 130, total: 195 }, { description: "Thermostat replacement", hours: 1.0, rate: 130, total: 130 }]),
    // 31: Freightliner fuel filters (Lars)
    sr({ vehicleId: vehicles[19].id, title: "Freightliner - Fuel Filter Change", description: "Primary and secondary fuel filters due. Replace both.", type: "maintenance", status: "scheduled", serviceDate: day(4), mileage: 212000, techName: "Lars Johansen", shopName: "Egeland Auto" },
      [{ name: "Primary Fuel Filter", partNumber: "FRT-PFF-CAS", quantity: 1, unitPrice: 65, total: 65 }, { name: "Secondary Fuel Filter", partNumber: "FRT-SFF-CAS", quantity: 1, unitPrice: 58, total: 58 }],
      [{ description: "Fuel filter replacement (both)", hours: 1.0, rate: 130, total: 130 }, { description: "Prime system and check for leaks", hours: 0.3, rate: 130, total: 39 }]),
    // 32: Mack mirror (Nina)
    sr({ vehicleId: vehicles[21].id, title: "Mack Granite - Mirror Replacement", description: "Left side mirror housing cracked. Replace complete mirror assembly.", type: "repair", status: "pending", serviceDate: day(4), mileage: 157000, techName: "Nina Berglund", shopName: "Egeland Auto" },
      [{ name: "Complete Mirror Assembly (left)", partNumber: "MACK-MA-L-GR", quantity: 1, unitPrice: 285, total: 285 }],
      [{ description: "Mirror assembly replacement", hours: 1.0, rate: 120, total: 120 }]),
    // 33: Ram battery (Kari)
    sr({ vehicleId: vehicles[16].id, title: "Ram 1500 - Battery Replace", description: "Slow cranking. Battery tested bad. Replace with OEM spec.", type: "repair", status: "pending", serviceDate: day(4), mileage: 45500, techName: "Kari Moen", shopName: "Egeland Auto" },
      [{ name: "Battery Group 65 AGM", partNumber: "BAT-G65-AGM", quantity: 1, unitPrice: 185, total: 185 }],
      [{ description: "Battery replacement and terminal cleaning", hours: 0.5, rate: 95, total: 47.50 }, { description: "Charging system test", hours: 0.2, rate: 95, total: 19 }]),
    // === Monday extras to fill the timeline ===
    // 34: Erik - Subaru Outback wheel alignment (Monday)
    sr({ vehicleId: vehicles[17].id, title: "Subaru Outback - Alignment + Tires", description: "Uneven front tire wear. Full 4-wheel alignment and tire rotation.", type: "maintenance", status: "scheduled", serviceDate: day(0), mileage: 9200, techName: "Erik Haugen", shopName: "Egeland Auto" },
      [{ name: "Alignment Hardware Kit", partNumber: "SUB-AHK-OB", quantity: 1, unitPrice: 28, total: 28 }],
      [{ description: "4-wheel alignment", hours: 1.5, rate: 110, total: 165 }, { description: "Tire rotation and balance", hours: 1.0, rate: 110, total: 110 }]),
    // 35: Erik - Porsche oil change (Monday)
    sr({ vehicleId: vehicles[13].id, title: "Porsche 911 - Oil Change", description: "Synthetic oil change with OEM filter. Check brake wear sensors.", type: "maintenance", status: "scheduled", serviceDate: day(0), mileage: 13200, techName: "Erik Haugen", shopName: "Egeland Auto" },
      [{ name: "Porsche Approved Oil 0W-40 (9qt)", partNumber: "POR-0W40-9Q", quantity: 1, unitPrice: 165, total: 165 }, { name: "Oil Filter", partNumber: "POR-OF-992", quantity: 1, unitPrice: 28, total: 28 }],
      [{ description: "Oil and filter change", hours: 1.0, rate: 145, total: 145 }, { description: "Multi-point inspection", hours: 0.5, rate: 145, total: 72.50 }]),
    // 36: Nina - BMW coolant hose (Monday)
    sr({ vehicleId: vehicles[4].id, title: "BMW 330i - Coolant Hose Replacement", description: "Upper radiator hose cracked. Replace hose and top off coolant.", type: "repair", status: "pending", serviceDate: day(0), mileage: 56000, techName: "Nina Berglund", shopName: "Egeland Auto" },
      [{ name: "Upper Radiator Hose", partNumber: "BMW-URH-N20", quantity: 1, unitPrice: 85, total: 85 }, { name: "Coolant G13 (1L)", partNumber: "BMW-COOL-1L", quantity: 2, unitPrice: 18, total: 36 }],
      [{ description: "Radiator hose replacement", hours: 1.5, rate: 120, total: 180 }, { description: "Coolant bleed and pressure test", hours: 0.5, rate: 120, total: 60 }]),
    // 37: Nina - Jeep brake inspection (Monday)
    sr({ vehicleId: vehicles[11].id, title: "Jeep Wrangler - Brake Inspection", description: "Customer reports squealing. Inspect pads, rotors, and calipers.", type: "inspection", status: "scheduled", serviceDate: day(0), mileage: 29000, techName: "Nina Berglund", shopName: "Egeland Auto" },
      [],
      [{ description: "Full brake system inspection", hours: 1.0, rate: 110, total: 110 }, { description: "Document findings and recommend", hours: 0.5, rate: 110, total: 55 }]),
    // 38: Kari - Fendt hydraulic filter (Monday)
    sr({ vehicleId: vehicles[25].id, title: "Fendt 942 - Hydraulic Filter Service", description: "Scheduled hydraulic filter change. Check system pressure.", type: "maintenance", status: "scheduled", serviceDate: day(0), mileage: 1250, techName: "Kari Moen", shopName: "Egeland Auto" },
      [{ name: "Hydraulic Filter Set", partNumber: "FENDT-HFS-942", quantity: 1, unitPrice: 165, total: 165 }, { name: "Hydraulic Oil Sample Kit", partNumber: "OIL-SAMPLE", quantity: 1, unitPrice: 15, total: 15 }],
      [{ description: "Hydraulic filter replacement", hours: 1.5, rate: 150, total: 225 }, { description: "Pressure test and oil sample", hours: 1.0, rate: 150, total: 150 }]),
    // 39: Kari - Excavator grease service (Monday)
    sr({ vehicleId: vehicles[33].id, title: "Komatsu PC210 - Full Grease Service", description: "Complete grease service all 24 fittings. Check pin play.", type: "maintenance", status: "scheduled", serviceDate: day(0), mileage: 3150, techName: "Kari Moen", shopName: "Egeland Auto" },
      [{ name: "Grease Cartridges (box of 10)", partNumber: "GRZ-EP2-10", quantity: 1, unitPrice: 42, total: 42 }],
      [{ description: "Grease all fittings (24 points)", hours: 2.0, rate: 130, total: 260 }, { description: "Pin and bushing play inspection", hours: 0.5, rate: 130, total: 65 }]),
    // 40: Daniel - Volvo FH brake adjustment (Monday)
    sr({ vehicleId: vehicles[20].id, title: "Volvo FH 640 - Brake Adjustment", description: "Annual brake adjustment. Check linings and drums.", type: "maintenance", status: "scheduled", serviceDate: day(0), mileage: 93000, techName: "Daniel Eriksen", shopName: "Egeland Auto" },
      [{ name: "Brake Lining Wear Indicators (set)", partNumber: "VOL-BLWI-FH", quantity: 1, unitPrice: 45, total: 45 }],
      [{ description: "Brake adjustment all axles", hours: 2.5, rate: 140, total: 350 }, { description: "Lining measurement and documentation", hours: 1.0, rate: 140, total: 140 }]),
    // 41: Daniel - Dump truck hydraulic hose (Monday)
    sr({ vehicleId: vehicles[23].id, title: "Dump Truck - Hydraulic Hose Replace", description: "Hose bulging near fitting. Replace before failure.", type: "repair", status: "pending", serviceDate: day(0), mileage: 83000, techName: "Daniel Eriksen", shopName: "Egeland Auto" },
      [{ name: "Hydraulic Hose Assembly 3/4\"", partNumber: "HYD-HA-34", quantity: 2, unitPrice: 120, total: 240 }, { name: "Hose Fittings (4-pack)", partNumber: "HYD-FIT-4", quantity: 1, unitPrice: 65, total: 65 }],
      [{ description: "Hose removal and replacement", hours: 2.0, rate: 130, total: 260 }, { description: "System bleed and pressure test", hours: 0.5, rate: 130, total: 65 }]),
    // 42: Lars - Subaru Forester oil (Monday)
    sr({ vehicleId: vehicles[17].id, title: "Subaru Outback - Oil Change", description: "Synthetic oil change. Check CVT fluid level.", type: "maintenance", status: "scheduled", serviceDate: day(0), mileage: 9500, techName: "Lars Johansen", shopName: "Egeland Auto" },
      [{ name: "Synthetic Oil 0W-20 (6qt)", partNumber: "SUB-0W20-6Q", quantity: 1, unitPrice: 52, total: 52 }, { name: "Oil Filter", partNumber: "SUB-OF-OB", quantity: 1, unitPrice: 14, total: 14 }],
      [{ description: "Oil and filter change", hours: 0.5, rate: 110, total: 55 }, { description: "CVT fluid level check", hours: 0.3, rate: 110, total: 33 }]),
    // 43: Lars - Kenworth air filter (Monday)
    sr({ vehicleId: vehicles[18].id, title: "Kenworth T680 - Air Filter Service", description: "Replace primary and secondary air filters. Clean intake ducting.", type: "maintenance", status: "scheduled", serviceDate: day(0), mileage: 186500, techName: "Lars Johansen", shopName: "Egeland Auto" },
      [{ name: "Primary Air Filter", partNumber: "KW-PAF-T680", quantity: 1, unitPrice: 85, total: 85 }, { name: "Secondary Air Filter", partNumber: "KW-SAF-T680", quantity: 1, unitPrice: 55, total: 55 }],
      [{ description: "Air filter replacement (both)", hours: 0.5, rate: 130, total: 65 }, { description: "Intake system inspection and clean", hours: 0.5, rate: 130, total: 65 }]),
    // 44: Sofia - Honda Civic tire rotation (Monday)
    sr({ vehicleId: vehicles[5].id, title: "Honda Civic - Tire Rotation + Check", description: "Rotate tires. Customer also reports slight vibration at highway speed.", type: "maintenance", status: "pending", serviceDate: day(0), mileage: 68500, techName: "Sofia Andersen", shopName: "Egeland Auto" },
      [],
      [{ description: "Tire rotation", hours: 0.5, rate: 95, total: 47.50 }, { description: "Wheel balance check (4 wheels)", hours: 0.5, rate: 95, total: 47.50 }, { description: "Road test for vibration", hours: 0.3, rate: 95, total: 28.50 }]),
  ]);

  // Unassigned jobs (NOT on the board - will show in unassigned panel)
  console.log("\nCreating unassigned service records...");
  const unassignedRecords = await Promise.all([
    sr({ vehicleId: vehicles[0].id, title: "Toyota Camry - Check Engine Light", description: "P0171 - System Too Lean. Diagnose and repair. Customer reports rough idle.", type: "repair", status: "pending", mileage: 16200, shopName: "Egeland Auto" },
      [{ name: "MAF Sensor", partNumber: "TOY-MAF-CAM", quantity: 1, unitPrice: 145, total: 145 }, { name: "Air Filter", partNumber: "TOY-AF-CAM", quantity: 1, unitPrice: 18, total: 18 }],
      [{ description: "Diagnostic scan and smoke test", hours: 1.0, rate: 110, total: 110 }, { description: "MAF sensor replacement", hours: 0.5, rate: 110, total: 55 }],
      "P0171 lean code. Inspected intake for vacuum leaks - none found. MAF sensor reading low. Suspect contaminated MAF."),
    sr({ vehicleId: vehicles[9].id, title: "Sprinter - Sliding Door Repair", description: "Sliding door sticking halfway. Roller mechanism needs replacement.", type: "repair", status: "pending", mileage: 36500, shopName: "Egeland Auto" },
      [{ name: "Sliding Door Roller Assembly", partNumber: "MB-SDRA-SPR", quantity: 1, unitPrice: 220, total: 220 }, { name: "Door Track Lubricant", partNumber: "LUB-DTL-1", quantity: 1, unitPrice: 15, total: 15 }],
      [{ description: "Roller mechanism removal and replacement", hours: 2.0, rate: 110, total: 220 }]),
    sr({ vehicleId: vehicles[13].id, title: "Porsche 911 - Pre-Track Inspection", description: "Full safety inspection before April track day. Brakes, fluids, suspension, tires.", type: "inspection", status: "pending", mileage: 13000, shopName: "Egeland Auto" },
      [{ name: "Brake Fluid DOT4 Racing (1L)", partNumber: "POR-BF-R-1L", quantity: 2, unitPrice: 48, total: 96 }],
      [{ description: "Full multi-point track safety inspection", hours: 2.0, rate: 145, total: 290 }, { description: "Brake fluid flush with racing fluid", hours: 1.5, rate: 145, total: 217.50 }]),
    sr({ vehicleId: vehicles[21].id, title: "Mack Granite - Dump Body Weld Repair", description: "Cracks in dump body floor. Weld repair and reinforce high-stress areas.", type: "repair", status: "pending", mileage: 156000, shopName: "Egeland Auto" },
      [{ name: "Steel Plate 3/8\" (2 sheets)", partNumber: "STL-PLT-38", quantity: 2, unitPrice: 120, total: 240 }, { name: "Welding Wire (10lb)", partNumber: "WLD-WIRE-10", quantity: 1, unitPrice: 45, total: 45 }],
      [{ description: "Grind and prep crack areas", hours: 2.0, rate: 130, total: 260 }, { description: "Weld repair and reinforce", hours: 4.0, rate: 130, total: 520 }]),
    sr({ vehicleId: vehicles[24].id, title: "John Deere 6R - Front Loader Pins", description: "Excessive play in front loader attachment pins. Replace pins and bushings.", type: "repair", status: "pending", mileage: 2800, shopName: "Egeland Auto" },
      [{ name: "Loader Pin Kit", partNumber: "JD-LPK-6R", quantity: 1, unitPrice: 185, total: 185 }, { name: "Bronze Bushings (set of 4)", partNumber: "JD-BB-6R-4", quantity: 1, unitPrice: 120, total: 120 }],
      [{ description: "Pin and bushing removal", hours: 2.0, rate: 140, total: 280 }, { description: "New bushing press-in and pin installation", hours: 2.0, rate: 140, total: 280 }]),
    sr({ vehicleId: vehicles[33].id, title: "Komatsu PC210 - Boom Cylinder Reseal", description: "Slow drift on boom cylinder. Reseal required.", type: "repair", status: "pending", mileage: 3200, shopName: "Egeland Auto" },
      [{ name: "Boom Cylinder Seal Kit", partNumber: "KOM-BCSK-PC210", quantity: 1, unitPrice: 320, total: 320 }, { name: "Hydraulic Oil (5gal)", partNumber: "HYD-ISO46-5G", quantity: 1, unitPrice: 95, total: 95 }],
      [{ description: "Boom cylinder removal", hours: 3.0, rate: 140, total: 420 }, { description: "Reseal and reinstall", hours: 2.5, rate: 140, total: 350 }]),
    sr({ vehicleId: vehicles[38].id, title: "Liebherr LTM 1100 - Outrigger Service", description: "Right rear outrigger slow to extend. Inspect valve and cylinder seals.", type: "repair", status: "pending", mileage: 4200, shopName: "Egeland Auto" },
      [{ name: "Outrigger Cylinder Seal Kit", partNumber: "LIE-OCSK-1100", quantity: 1, unitPrice: 450, total: 450 }, { name: "Outrigger Control Valve", partNumber: "LIE-OCV-1100", quantity: 1, unitPrice: 680, total: 680 }],
      [{ description: "Diagnose outrigger hydraulic circuit", hours: 2.0, rate: 150, total: 300 }, { description: "Cylinder reseal or valve replacement", hours: 4.0, rate: 150, total: 600 }]),
    sr({ vehicleId: vehicles[6].id, title: "Tesla Model 3 - 12V Battery Replace", description: "Low voltage warning. Replace 12V auxiliary battery.", type: "repair", status: "pending", mileage: 8200, shopName: "Egeland Auto" },
      [{ name: "12V Lithium Battery (Tesla OEM)", partNumber: "TES-12V-M3", quantity: 1, unitPrice: 110, total: 110 }],
      [{ description: "12V battery replacement", hours: 0.5, rate: 110, total: 55 }]),
    sr({ vehicleId: vehicles[25].id, title: "Fendt 942 - GPS Autosteer Calibration", description: "Autosteer drifting right by 6 inches. Recalibrate GPS receiver and steering controller.", type: "maintenance", status: "scheduled", mileage: 1200, shopName: "Egeland Auto" },
      [],
      [{ description: "GPS receiver calibration", hours: 1.5, rate: 150, total: 225 }, { description: "Steering controller calibration and field test", hours: 2.0, rate: 150, total: 300 }],
      "RTK base station signal verified. GPS receiver antenna checked - mounting bracket slightly loose causing drift. Tighten and recalibrate."),
    sr({ vehicleId: vehicles[35].id, title: "Volvo EC220E - Bucket Teeth Replace", description: "3 worn bucket teeth. Replace full set of 5 for even wear.", type: "maintenance", status: "pending", mileage: 1600, shopName: "Egeland Auto" },
      [{ name: "Bucket Teeth Set (5)", partNumber: "VOL-BTS-EC220", quantity: 1, unitPrice: 340, total: 340 }, { name: "Retainer Pins (5-pack)", partNumber: "VOL-RP-5", quantity: 1, unitPrice: 45, total: 45 }],
      [{ description: "Bucket teeth removal and replacement", hours: 1.5, rate: 130, total: 195 }]),
    sr({ vehicleId: vehicles[20].id, title: "Volvo FH 640 - Turbo Boost Leak", description: "Low power complaint. Suspect charge air cooler pipe leak. Diagnose.", type: "repair", status: "pending", mileage: 93500, shopName: "Egeland Auto" },
      [{ name: "Charge Air Cooler Pipe + Clamps", partNumber: "VOL-CACP-FH", quantity: 1, unitPrice: 185, total: 185 }],
      [{ description: "Boost leak diagnosis and smoke test", hours: 1.5, rate: 140, total: 210 }, { description: "Pipe replacement and clamp tightening", hours: 1.0, rate: 140, total: 140 }],
      "Smoke test confirmed leak at charge air cooler pipe connection. Clamp was loose and pipe boot cracked."),
    sr({ vehicleId: vehicles[18].id, title: "Kenworth T680 - Sleeper AC Repair", description: "Sleeper AC not cooling. Likely low refrigerant or compressor issue.", type: "repair", status: "waiting-parts", mileage: 186000, shopName: "Egeland Auto" },
      [{ name: "Sleeper AC Compressor", partNumber: "KW-SAC-T680", quantity: 1, unitPrice: 580, total: 580 }, { name: "Refrigerant R-134a (3 cans)", partNumber: "REF-134A-3", quantity: 1, unitPrice: 65, total: 65 }, { name: "AC Condenser", partNumber: "KW-COND-T680", quantity: 1, unitPrice: 320, total: 320 }],
      [{ description: "Sleeper AC system diagnosis", hours: 1.5, rate: 140, total: 210 }, { description: "Compressor and condenser replacement", hours: 3.5, rate: 140, total: 490 }, { description: "Evacuate, recharge and leak test", hours: 1.0, rate: 140, total: 140 }],
      "Compressor seized. Condenser contaminated with metal debris from failed compressor. Both need replacement. Parts on order - ETA Wednesday."),
  ]);
  console.log(`  Created ${unassignedRecords.length} unassigned service records`);

  const jobUpdates = await Promise.all([
    // ============ MONDAY (day 0) - 2026-03-09 - Primary showcase day ============
    // Jake Wilson [0]: Honda AC (8:00-11:30) + F-150 trans flush (12:30-15:00)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[0].id }, data: { technicianId: technicians[0].id, sortOrder: 0, startDateTime: dt(0, 8, 0), endDateTime: dt(0, 11, 30) } }),
    prisma.serviceRecord.update({ where: { id: serviceRecords[18].id }, data: { technicianId: technicians[0].id, sortOrder: 1, startDateTime: dt(0, 12, 30), endDateTime: dt(0, 15, 0) } }),
    // Chris Taylor [1]: Audi timing belt (7:30-13:00)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[1].id }, data: { technicianId: technicians[1].id, sortOrder: 0, startDateTime: dt(0, 7, 30), endDateTime: dt(0, 13, 0) } }),
    // Marcus Reed [2]: CAT 745 transmission rebuild (7:00-16:00, multi-day spans Mon-Wed)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[6].id }, data: { technicianId: technicians[2].id, sortOrder: 0, startDateTime: dt(0, 7, 0), endDateTime: dt(2, 16, 0) } }),
    // Sofia Andersen [3]: Tesla suspension (9:00-11:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[2].id }, data: { technicianId: technicians[3].id, sortOrder: 0, startDateTime: dt(0, 9, 0), endDateTime: dt(0, 11, 30) } }),
    // Lars Johansen [5]: Ram oil change (8:00-9:00)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[12].id }, data: { technicianId: technicians[5].id, sortOrder: 0, startDateTime: dt(0, 8, 0), endDateTime: dt(0, 9, 0) } }),
    // Tom Bradley [7]: Concrete mixer drum motor (7:30-14:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[14].id }, data: { technicianId: technicians[7].id, sortOrder: 0, startDateTime: dt(0, 7, 30), endDateTime: dt(0, 14, 30) } }),
    // Erik Haugen [4]: Subaru alignment (8:00-10:30) + Porsche oil (11:00-12:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[34].id }, data: { technicianId: technicians[4].id, sortOrder: 0, startDateTime: dt(0, 8, 0), endDateTime: dt(0, 10, 30) } }),
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[35].id }, data: { technicianId: technicians[4].id, sortOrder: 1, startDateTime: dt(0, 11, 0), endDateTime: dt(0, 12, 30) } }),
    // Nina Berglund [6]: BMW coolant hose (7:30-9:30) + Jeep brake inspection (10:00-11:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[36].id }, data: { technicianId: technicians[6].id, sortOrder: 0, startDateTime: dt(0, 7, 30), endDateTime: dt(0, 9, 30) } }),
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[37].id }, data: { technicianId: technicians[6].id, sortOrder: 1, startDateTime: dt(0, 10, 0), endDateTime: dt(0, 11, 30) } }),
    // Kari Moen [8]: Fendt hydraulic filter (8:00-10:30) + Komatsu grease (11:00-13:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[38].id }, data: { technicianId: technicians[8].id, sortOrder: 0, startDateTime: dt(0, 8, 0), endDateTime: dt(0, 10, 30) } }),
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[39].id }, data: { technicianId: technicians[8].id, sortOrder: 1, startDateTime: dt(0, 11, 0), endDateTime: dt(0, 13, 30) } }),
    // Daniel Eriksen [9]: Volvo brake adjustment (7:30-11:00) + Dump truck hose (11:30-14:00)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[40].id }, data: { technicianId: technicians[9].id, sortOrder: 0, startDateTime: dt(0, 7, 30), endDateTime: dt(0, 11, 0) } }),
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[41].id }, data: { technicianId: technicians[9].id, sortOrder: 1, startDateTime: dt(0, 11, 30), endDateTime: dt(0, 14, 0) } }),
    // Lars Johansen [5]: (already has Ram 8-9) + Subaru oil (9:15-10:00) + Kenworth air filter (10:30-11:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[42].id }, data: { technicianId: technicians[5].id, sortOrder: 1, startDateTime: dt(0, 9, 15), endDateTime: dt(0, 10, 0) } }),
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[43].id }, data: { technicianId: technicians[5].id, sortOrder: 2, startDateTime: dt(0, 10, 30), endDateTime: dt(0, 11, 30) } }),
    // Sofia Andersen [3]: (already has Tesla 9-11:30) + Honda tire rotation (12:00-13:15)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[44].id }, data: { technicianId: technicians[3].id, sortOrder: 1, startDateTime: dt(0, 12, 0), endDateTime: dt(0, 13, 15) } }),

    // ============ TUESDAY (day 1) ============
    // Jake [0]: Silverado 60K (8:00-11:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[3].id }, data: { technicianId: technicians[0].id, sortOrder: 0, startDateTime: dt(1, 8, 0), endDateTime: dt(1, 11, 30) } }),
    // Chris [1]: Sprinter turbo (7:30-13:00)
    prisma.serviceRecord.update({ where: { id: serviceRecords[12].id }, data: { technicianId: technicians[1].id, sortOrder: 0, startDateTime: dt(1, 7, 30), endDateTime: dt(1, 13, 0) } }),
    // Marcus [2]: CAT 745 continued (multi-day job spans from Monday)
    // Erik [4]: Tacoma leaf springs (8:00-11:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[4].id }, data: { technicianId: technicians[4].id, sortOrder: 0, startDateTime: dt(1, 8, 0), endDateTime: dt(1, 11, 30) } }),
    // Nina [6]: F-150 wheel bearing (9:00-11:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[13].id }, data: { technicianId: technicians[6].id, sortOrder: 0, startDateTime: dt(1, 9, 0), endDateTime: dt(1, 11, 30) } }),
    // Daniel [9]: Dump truck tailgate (8:00-12:00)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[16].id }, data: { technicianId: technicians[9].id, sortOrder: 0, startDateTime: dt(1, 8, 0), endDateTime: dt(1, 12, 0) } }),

    // ============ WEDNESDAY (day 2) ============
    // Jake [0]: F-150 exhaust (8:00-11:00)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[7].id }, data: { technicianId: technicians[0].id, sortOrder: 0, startDateTime: dt(2, 8, 0), endDateTime: dt(2, 11, 0) } }),
    // Marcus [2]: Bobcat annual (13:00-15:30, after CAT 745 wraps up)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[5].id }, data: { technicianId: technicians[2].id, sortOrder: 1, startDateTime: dt(2, 13, 0), endDateTime: dt(2, 15, 30) } }),
    // Chris [1]: Volvo EC220E (7:30-13:00)
    prisma.serviceRecord.update({ where: { id: serviceRecords[10].id }, data: { technicianId: technicians[1].id, sortOrder: 0, startDateTime: dt(2, 7, 30), endDateTime: dt(2, 13, 0) } }),
    // Kari [8]: Tractor PTO clutch (8:30-10:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[15].id }, data: { technicianId: technicians[8].id, sortOrder: 0, startDateTime: dt(2, 8, 30), endDateTime: dt(2, 10, 30) } }),
    // Nina [6]: VW Golf clutch (7:30-14:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[18].id }, data: { technicianId: technicians[6].id, sortOrder: 0, startDateTime: dt(2, 7, 30), endDateTime: dt(2, 14, 30) } }),

    // ============ THURSDAY (day 3) ============
    // Erik [4]: Freightliner air brakes (7:30-15:00)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[8].id }, data: { technicianId: technicians[4].id, sortOrder: 0, startDateTime: dt(3, 7, 30), endDateTime: dt(3, 15, 0) } }),
    // Sofia [3]: Ram transfer case (9:00-10:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[9].id }, data: { technicianId: technicians[3].id, sortOrder: 0, startDateTime: dt(3, 9, 0), endDateTime: dt(3, 10, 30) } }),
    // Jake [0]: Volvo FH DOT inspection (7:30-13:30)
    prisma.serviceRecord.update({ where: { id: serviceRecords[5].id }, data: { technicianId: technicians[0].id, sortOrder: 0, startDateTime: dt(3, 7, 30), endDateTime: dt(3, 13, 30) } }),
    // Lars [5]: Forklift mast chain (8:00-11:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[17].id }, data: { technicianId: technicians[5].id, sortOrder: 0, startDateTime: dt(3, 8, 0), endDateTime: dt(3, 11, 30) } }),
    // Kari [8]: Kenworth clutch adjust (8:00-10:00)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[20].id }, data: { technicianId: technicians[8].id, sortOrder: 0, startDateTime: dt(3, 8, 0), endDateTime: dt(3, 10, 0) } }),

    // ============ FRIDAY (day 4) ============
    // Jake [0] (3 jobs): Camry cabin filter (8:00-8:30), Honda brakes (8:45-10:00), Silverado taillight (10:15-10:45)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[22].id }, data: { technicianId: technicians[0].id, sortOrder: 0, startDateTime: dt(4, 8, 0), endDateTime: dt(4, 8, 30) } }),
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[23].id }, data: { technicianId: technicians[0].id, sortOrder: 1, startDateTime: dt(4, 8, 45), endDateTime: dt(4, 10, 0) } }),
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[24].id }, data: { technicianId: technicians[0].id, sortOrder: 2, startDateTime: dt(4, 10, 15), endDateTime: dt(4, 10, 45) } }),
    // Chris [1] (3 jobs): Jeep axle seal (7:30-10:30), Sprinter oil (11:00-12:30), BMW coolant (13:00-14:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[11].id }, data: { technicianId: technicians[1].id, sortOrder: 0, startDateTime: dt(4, 7, 30), endDateTime: dt(4, 10, 30) } }),
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[25].id }, data: { technicianId: technicians[1].id, sortOrder: 1, startDateTime: dt(4, 11, 0), endDateTime: dt(4, 12, 30) } }),
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[26].id }, data: { technicianId: technicians[1].id, sortOrder: 2, startDateTime: dt(4, 13, 0), endDateTime: dt(4, 14, 30) } }),
    // Marcus [2]: Combine pre-season (7:00-15:00)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[10].id }, data: { technicianId: technicians[2].id, sortOrder: 0, startDateTime: dt(4, 7, 0), endDateTime: dt(4, 15, 0) } }),
    // Sofia [3] (3 jobs): Ram alignment (8:00-9:00), Audi spark plugs (9:30-11:00), Tesla tire rotation (11:30-12:15)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[27].id }, data: { technicianId: technicians[3].id, sortOrder: 0, startDateTime: dt(4, 8, 0), endDateTime: dt(4, 9, 0) } }),
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[28].id }, data: { technicianId: technicians[3].id, sortOrder: 1, startDateTime: dt(4, 9, 30), endDateTime: dt(4, 11, 0) } }),
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[29].id }, data: { technicianId: technicians[3].id, sortOrder: 2, startDateTime: dt(4, 11, 30), endDateTime: dt(4, 12, 15) } }),
    // Erik [4]: Massey Ferguson radiator (8:00-10:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[30].id }, data: { technicianId: technicians[4].id, sortOrder: 0, startDateTime: dt(4, 8, 0), endDateTime: dt(4, 10, 30) } }),
    // Lars [5]: Freightliner fuel filters (8:00-9:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[31].id }, data: { technicianId: technicians[5].id, sortOrder: 0, startDateTime: dt(4, 8, 0), endDateTime: dt(4, 9, 30) } }),
    // Nina [6]: Mack mirror replacement (9:00-10:00)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[32].id }, data: { technicianId: technicians[6].id, sortOrder: 0, startDateTime: dt(4, 9, 0), endDateTime: dt(4, 10, 0) } }),
    // Tom [7]: Combine header knives (7:30-11:30)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[19].id }, data: { technicianId: technicians[7].id, sortOrder: 0, startDateTime: dt(4, 7, 30), endDateTime: dt(4, 11, 30) } }),
    // Kari [8]: Ram battery replace (8:00-8:45)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[33].id }, data: { technicianId: technicians[8].id, sortOrder: 0, startDateTime: dt(4, 8, 0), endDateTime: dt(4, 8, 45) } }),
    // Daniel [9]: Jeep steering stabilizer (8:00-10:00)
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[21].id }, data: { technicianId: technicians[9].id, sortOrder: 0, startDateTime: dt(4, 8, 0), endDateTime: dt(4, 10, 0) } }),
  ]);
  console.log(`  Updated ${jobUpdates.length} service records with technician assignments and time slots`);

  // -- Assign the Demo Owner a few active jobs so the dashboard "My Active Jobs" populates --
  console.log("\nAssigning active jobs to the Demo Owner technician...");
  const demoOwnerTech = technicians[10]; // Demo Owner
  const demoOwnerJobs = await Promise.all([
    // Tesla Model Y suspension (pending) — reassign from Sofia
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[2].id }, data: { technicianId: demoOwnerTech.id } }),
    // F-150 exhaust leak repair (pending) — reassign from Jake
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[7].id }, data: { technicianId: demoOwnerTech.id } }),
    // Jeep axle seal replacement (pending) — reassign from Chris
    prisma.serviceRecord.update({ where: { id: boardServiceRecords[11].id }, data: { technicianId: demoOwnerTech.id } }),
    // Kenworth T680 Sleeper AC repair (waiting-parts) — previously unassigned
    prisma.serviceRecord.update({ where: { id: unassignedRecords[11].id }, data: { technicianId: demoOwnerTech.id } }),
    // Porsche 911 Pre-Track Inspection (pending) — previously unassigned
    prisma.serviceRecord.update({ where: { id: unassignedRecords[2].id }, data: { technicianId: demoOwnerTech.id } }),
  ]);
  console.log(`  Assigned ${demoOwnerJobs.length} active jobs to ${demoOwnerTech.name}`);

  // -- Summary --
  console.log("\n" + "=".repeat(50));
  console.log("Seed completed!");
  console.log("=".repeat(50));
  console.log(`  Customers:       ${customers.length}`);
  console.log(`  Vehicles:        ${vehicles.length}`);
  console.log(`  Service Records: ${serviceRecords.length + boardServiceRecords.length + unassignedRecords.length + predMaintRecords.length}`);
  console.log(`  Quotes:          ${quotes.length}`);
  console.log(`  Inventory Parts: ${inventoryParts.length}`);
  console.log(`  Technicians:     ${technicians.length}`);
  console.log(`  Board Assignments: (removed - technicianId set directly on service records)`);
  console.log(`  Unassigned Jobs: ${unassignedRecords.length}`);
  console.log(`  Notes:           ${9 + additionalNotes.length}`);
  console.log(`  Reminders:       ${8 + additionalReminders.length}`);
  console.log(`  Findings:        ${findings.length}`);
  console.log(`  SMS Messages:    22`);
  console.log("=".repeat(50));
}

seed()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
