import { db } from "./client";
import { users, academicYears, centres, classes, brandingProfiles, resultTemplates, templateFields } from "./schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Seeding S-CUBUS ERP database...");

  // --- Owner user -----------------------------------------------------
  const existingOwner = db.select().from(users).where(eq(users.email, "owner@scubus.in")).get();
  if (!existingOwner) {
    const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
    db.insert(users)
      .values({
        name: "S-CUBUS Owner",
        email: "owner@scubus.in",
        passwordHash,
        role: "OWNER",
      })
      .run();
    console.log("Created owner user: owner@scubus.in / ChangeMe123!");
  } else {
    console.log("Owner user already exists, skipping.");
  }

  const owner = db.select().from(users).where(eq(users.email, "owner@scubus.in")).get()!;

  // --- Reference data ---------------------------------------------------
  if (db.select().from(academicYears).all().length === 0) {
    db.insert(academicYears).values({ label: "2025-26" }).run();
    db.insert(academicYears).values({ label: "2026-27" }).run();
    console.log("Seeded academic years.");
  }

  if (db.select().from(centres).all().length === 0) {
    db.insert(centres).values({ name: "S-CUBUS Main Centre", code: "SC-MAIN" }).run();
    console.log("Seeded a default centre.");
  }

  if (db.select().from(classes).all().length === 0) {
    db.insert(classes).values({ name: "Class 11", workspace: "EXAMS" }).run();
    db.insert(classes).values({ name: "Class 12", workspace: "EXAMS" }).run();
    db.insert(classes).values({ name: "Class 12", workspace: "SATHII" }).run();
    console.log("Seeded default classes.");
  }

  if (db.select().from(brandingProfiles).all().length === 0) {
    db.insert(brandingProfiles).values({
      name: "S-CUBUS Default",
      primaryLogoUrl: "/branding/scubus-primary.svg",
      isDefault: true,
    }).run();
    console.log("Seeded default branding profile.");
  }

  // --- A ready-to-use RESULT template ------------------------------------
  const existingTemplate = db.select().from(resultTemplates).where(eq(resultTemplates.name, "Standard NEET-style Result")).get();
  if (!existingTemplate) {
    const template = db
      .insert(resultTemplates)
      .values({
        name: "Standard NEET-style Result",
        type: "RESULT",
        version: 1,
        isActive: true,
        createdById: owner.id,
      })
      .returning()
      .get();

    const fields: { targetField: string; subjectName?: string; sourceAliases: string[]; required: boolean }[] = [
      { targetField: "STUDENT_NAME", sourceAliases: ["Student Name", "Name", "Candidate Name"], required: true },
      { targetField: "SCID", sourceAliases: ["SCID"], required: false },
      { targetField: "SATHII_KEY", sourceAliases: ["SATHII KEY", "SATHII Key"], required: false },
      { targetField: "ROLL_NUMBER", sourceAliases: ["Roll No", "Roll Number", "RollNo"], required: true },
      { targetField: "CLASS", sourceAliases: ["Class", "Std"], required: false },
      { targetField: "BATCH", sourceAliases: ["Batch"], required: false },
      { targetField: "CODE", sourceAliases: ["Code", "Set Code"], required: false },
      { targetField: "SUBJECT_MARKS", subjectName: "Physics", sourceAliases: ["Physics", "PHY"], required: false },
      { targetField: "SUBJECT_MARKS", subjectName: "Chemistry", sourceAliases: ["Chemistry", "CHE"], required: false },
      { targetField: "SUBJECT_MARKS", subjectName: "Biology", sourceAliases: ["Biology", "BIO"], required: false },
      { targetField: "TOTAL_MARKS", sourceAliases: ["Total", "Total Marks"], required: false },
      { targetField: "PERCENTAGE", sourceAliases: ["Percentage", "%"], required: false },
    ];

    fields.forEach((f, order) => {
      db.insert(templateFields)
        .values({
          templateId: template.id,
          targetField: f.targetField as never,
          subjectName: f.subjectName ?? null,
          sourceAliases: JSON.stringify(f.sourceAliases),
          required: f.required,
          order,
        })
        .run();
    });
    console.log("Seeded a starter Result Template (Standard NEET-style Result).");
  }

  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
