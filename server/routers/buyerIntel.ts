import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { SYSTEM_BUYER_RANKING } from "../_core/prompts";
import {
  getBuyerInterestsByListing,
  getActivities,
  getContactById,
  getListingById,
  updateBuyerInterest,
} from "../db";
import { getDb } from "../db";
import { buyerInterests } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { parseLlmJson } from "../lib/parseLlmJson";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNewBuyer(createdAt: Date | string): boolean {
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  return new Date(createdAt) >= twoWeeksAgo;
}

function formatPrice(n?: number | null): string {
  if (!n) return "N/A";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const buyerIntelRouter = router({

  // ── Update price point feedback ────────────────────────────────────────────
  updatePricePoint: protectedProcedure
    .input(z.object({
      id: z.number(),
      pricePointFeedback: z.string().max(500),
    }))
    .mutation(({ ctx, input }) =>
      updateBuyerInterest(input.id, ctx.user.id, { pricePointFeedback: input.pricePointFeedback })
    ),

  // ── AI Rank buyers for a listing ──────────────────────────────────────────
  rankBuyers: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const listing = await getListingById(input.listingId, ctx.user.id);
      if (!listing) throw new Error("Listing not found");

      const buyerRows = await getBuyerInterestsByListing(input.listingId, ctx.user.id);
      if (!buyerRows.length) return { ranked: [] };

      // Fetch activities per buyer (for this listing + general contact activities)
      const buyerData = await Promise.all(buyerRows.map(async ({ interest, contact }) => {
        const listingActivities = await getActivities(ctx.user.id, { listingId: input.listingId, contactId: interest.contactId, limit: 30 });
        const contactActivities = await getActivities(ctx.user.id, { contactId: interest.contactId, limit: 20 });
        // Check if buyer is also a property owner in the system
        const contactRecord = contact?.id ? await getContactById(contact.id, ctx.user.id) : null;
        // Count how many other listings this buyer is interested in
        const otherInterests = await db
          .select({ id: buyerInterests.id, listingId: buyerInterests.listingId, status: buyerInterests.status })
          .from(buyerInterests)
          .where(and(eq(buyerInterests.contactId, interest.contactId), eq(buyerInterests.userId, ctx.user.id)));
        const otherListingCount = otherInterests.filter(i => i.listingId !== input.listingId).length;

        return {
          interest,
          contact,
          isOwner: contactRecord?.isOwner ?? false,
          isNew: isNewBuyer(interest.createdAt),
          listingActivityCount: listingActivities.length,
          listingActivitiesSummary: listingActivities.map(a =>
            `[${a.type}${a.occurredAt ? ` on ${new Date(a.occurredAt).toLocaleDateString()}` : ""}] ${a.subject ?? ""}: ${(a.notes ?? "").slice(0, 200)}`
          ).join("\n"),
          generalActivityCount: contactActivities.length,
          otherListingCount,
        };
      }));

      // Build AI prompt
      const buyerSections = buyerData.map((b, idx) => {
        const name = `${b.contact?.firstName ?? ""} ${b.contact?.lastName ?? ""}`.trim() || `Buyer #${idx + 1}`;
        return `
BUYER ${idx + 1}: ${name} (ID: ${b.interest.id})
  Status: ${b.interest.status}
  Price Point Feedback: ${b.interest.pricePointFeedback ?? "none provided"}
  Offer Amount: ${b.interest.offerAmount ? formatPrice(b.interest.offerAmount) : "none"}
  Is Property Owner in system: ${b.isOwner ? "YES" : "no"}
  Is New Buyer (added <2 weeks ago): ${b.isNew ? "YES" : "no"}
  Interactions about this listing: ${b.listingActivityCount}
  Other listings interested in: ${b.otherListingCount}
  Interaction log:
${b.listingActivitiesSummary || "  (no logged interactions)"}
  Notes: ${b.interest.notes ?? "none"}`;
      }).join("\n\n");

      const prompt = `${SYSTEM_BUYER_RANKING}

LISTING: ${listing.title}
Asking Price: ${formatPrice(listing.askingPrice)}
Cap Rate: ${listing.capRate ? `${listing.capRate}%` : "N/A"}

BUYERS:
${buyerSections}

RANKING CRITERIA (weight each factor):
1. Number and recency of interactions about this listing (more = better)
2. Quality of interactions: asked specific questions, toured, mentioned LOI (much better)
3. Price feedback vs asking price (closer to asking = better; far below = lower rank)
4. Stage in process (loi_submitted > toured > interested > contacted > prospect > passed)
5. Interest in other listings (shows active buyer, good signal)
6. Is a property owner in the system (credibility signal, better)
7. New buyers (<2 weeks): give a score bonus but note they are new
8. Buyers who have gone quiet (many interactions then silence): flag for follow-up if you think they are worth re-engaging

For each buyer, provide:
- score: 1-10 (10 = highest priority)
- rationale: 1-2 sentences explaining the rank
- followUpFlag: true if buyer has gone quiet but seems worth re-engaging, false otherwise

Respond ONLY with valid JSON (no markdown):
{
  "rankings": [
    { "interestId": <number>, "score": <1-10>, "rationale": "<string>", "followUpFlag": <boolean> }
  ],
  "marketSummary": "<2-3 sentence overall summary of the buyer pool for this listing>"
}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: `${SYSTEM_BUYER_RANKING} Respond only with valid JSON.` },
          { role: "user", content: prompt },
        ],
      });

      const rawContent = String(response.choices[0]?.message?.content ?? "{}");
      let parsed: { rankings: Array<{ interestId: number; score: number; rationale: string; followUpFlag: boolean }>; marketSummary: string };
      try {
        parsed = parseLlmJson(rawContent);
      } catch {
        throw new Error("AI returned invalid JSON");
      }

      // Persist scores back to DB
      const now = new Date();
      await Promise.all(parsed.rankings.map(r =>
        updateBuyerInterest(r.interestId, ctx.user.id, {
          aiScore: r.score,
          aiRationale: r.rationale,
          aiFollowUpFlag: r.followUpFlag,
          aiRankedAt: now,
        })
      ));

      return {
        ranked: parsed.rankings,
        marketSummary: parsed.marketSummary,
      };
    }),

  // ── Generate PDF buyer report ──────────────────────────────────────────────
  generateReport: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const listing = await getListingById(input.listingId, ctx.user.id);
      if (!listing) throw new Error("Listing not found");

      const buyerRows = await getBuyerInterestsByListing(input.listingId, ctx.user.id);

      // Sort: new buyers first, then by aiScore desc, then by status weight
      const statusWeight: Record<string, number> = {
        loi_submitted: 7, under_contract: 8, closed: 9,
        toured: 6, interested: 5, contacted: 4, prospect: 3, passed: 1,
      };
      const sorted = [...buyerRows].sort((a, b) => {
        const aNew = isNewBuyer(a.interest.createdAt) ? 1 : 0;
        const bNew = isNewBuyer(b.interest.createdAt) ? 1 : 0;
        if (aNew !== bNew) return bNew - aNew;
        const aScore = a.interest.aiScore ?? statusWeight[a.interest.status] ?? 3;
        const bScore = b.interest.aiScore ?? statusWeight[b.interest.status] ?? 3;
        return bScore - aScore;
      });

      const active = sorted.filter(b => b.interest.status !== "passed");
      const passed = sorted.filter(b => b.interest.status === "passed");

      // Build AI market summary if not already ranked
      let marketSummary = "";
      if (active.length > 0) {
        const summaryPrompt = `Write a 2-3 sentence professional market summary for a seller about their listing's buyer activity. Be specific and data-driven.

Listing: ${listing.title}
Asking Price: ${formatPrice(listing.askingPrice)}
Active Buyers: ${active.length}
Buyers with LOI/Under Contract: ${active.filter(b => ["loi_submitted","under_contract"].includes(b.interest.status)).length}
Buyers who toured: ${active.filter(b => b.interest.status === "toured").length}
Price feedback range: ${active.filter(b => b.interest.pricePointFeedback).map(b => b.interest.pricePointFeedback).join(", ") || "none collected"}

Write the summary in third person as if reporting to the property owner. No preamble, just the summary.`;

        const res = await invokeLLM({
          messages: [{ role: "user", content: summaryPrompt }],
        });
        marketSummary = String(res.choices[0]?.message?.content ?? "");
      }

      // Generate PDF as base64
      const pdfBase64 = await new Promise<string>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: "LETTER" });
        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
        doc.on("error", reject);

        const DARK = "#1a1a2e";
        const ACCENT = "#4f46e5";
        const GRAY = "#6b7280";
        const LIGHT_GRAY = "#f3f4f6";

        // ── Header ──
        doc.rect(0, 0, doc.page.width, 80).fill(DARK);
        doc.fillColor("white").fontSize(20).font("Helvetica-Bold")
          .text(listing.title, 50, 20, { width: 400 });
        doc.fontSize(11).font("Helvetica").fillColor("#a5b4fc")
          .text(`Buyer Activity Report  ·  ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, 50, 48);
        doc.moveDown(3);

        // ── Listing summary bar ──
        doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold")
          .text("LISTING OVERVIEW", 50, doc.y);
        doc.moveDown(0.3);
        const overviewY = doc.y;
        doc.rect(50, overviewY, doc.page.width - 100, 40).fill(LIGHT_GRAY);
        doc.fillColor(DARK).fontSize(10).font("Helvetica")
          .text(`Asking Price: ${formatPrice(listing.askingPrice)}`, 60, overviewY + 8)
          .text(`Cap Rate: ${listing.capRate ? `${listing.capRate}%` : "N/A"}`, 200, overviewY + 8)
          .text(`Stage: ${(listing.stage ?? "active").replace(/_/g, " ")}`, 310, overviewY + 8)
          .text(`Active Buyers: ${active.length}`, 430, overviewY + 8);
        doc.moveDown(3.5);

        // ── Market summary ──
        if (marketSummary) {
          doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold").text("MARKET SUMMARY");
          doc.moveDown(0.3);
          doc.fillColor(GRAY).fontSize(10).font("Helvetica")
            .text(marketSummary, { width: doc.page.width - 100 });
          doc.moveDown(1.5);
        }

        // ── Active buyers table ──
        doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold").text("ACTIVE BUYERS");
        doc.moveDown(0.4);

        // Table header
        const colX = { rank: 50, name: 80, status: 220, price: 310, score: 400, flag: 450 };
        const headerY = doc.y;
        doc.rect(50, headerY, doc.page.width - 100, 18).fill(ACCENT);
        doc.fillColor("white").fontSize(8).font("Helvetica-Bold")
          .text("#", colX.rank, headerY + 5)
          .text("Buyer", colX.name, headerY + 5)
          .text("Status", colX.status, headerY + 5)
          .text("Price Feedback", colX.price, headerY + 5)
          .text("AI Score", colX.score, headerY + 5)
          .text("Flag", colX.flag, headerY + 5);
        doc.moveDown(1.5);

        active.forEach((b, idx) => {
          const name = `${b.contact?.firstName ?? ""} ${b.contact?.lastName ?? ""}`.trim() || "Unknown";
          const rowY = doc.y;
          if (idx % 2 === 0) {
            doc.rect(50, rowY - 2, doc.page.width - 100, 14).fill("#f9fafb");
          }
          const newTag = isNewBuyer(b.interest.createdAt) ? " ★NEW" : "";
          doc.fillColor(DARK).fontSize(8).font("Helvetica")
            .text(`${idx + 1}`, colX.rank, rowY)
            .text(`${name}${newTag}${b.contact?.company ? ` (${b.contact.company})` : ""}`, colX.name, rowY, { width: 130 })
            .text(b.interest.status.replace(/_/g, " "), colX.status, rowY)
            .text(b.interest.pricePointFeedback ?? b.interest.offerAmount ? formatPrice(b.interest.offerAmount) : "—", colX.price, rowY, { width: 85 })
            .text(b.interest.aiScore != null ? `${b.interest.aiScore}/10` : "—", colX.score, rowY)
            .text(b.interest.aiFollowUpFlag ? "⚑ Follow up" : "", colX.flag, rowY);
          doc.moveDown(1);

          // AI rationale
          if (b.interest.aiRationale) {
            doc.fillColor(GRAY).fontSize(7.5).font("Helvetica-Oblique")
              .text(`  → ${b.interest.aiRationale}`, colX.name, doc.y, { width: doc.page.width - 130 });
            doc.moveDown(0.8);
          }

          // Page break check
          if (doc.y > doc.page.height - 100) doc.addPage();
        });

        // ── Passed buyers ──
        if (passed.length > 0) {
          doc.moveDown(1);
          doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold").text("PASSED / DECLINED");
          doc.moveDown(0.4);
          passed.forEach((b) => {
            const name = `${b.contact?.firstName ?? ""} ${b.contact?.lastName ?? ""}`.trim() || "Unknown";
            doc.fillColor(GRAY).fontSize(8).font("Helvetica")
              .text(`• ${name}${b.contact?.company ? ` (${b.contact.company})` : ""}  —  ${b.interest.pricePointFeedback ?? b.interest.notes ?? "No reason logged"}`,
                { width: doc.page.width - 100 });
            doc.moveDown(0.6);
          });
        }

        // ── Footer ──
        doc.fontSize(7).fillColor(GRAY).font("Helvetica")
          .text(`Generated by RE CRM  ·  Confidential  ·  ${new Date().toLocaleDateString()}`,
            50, doc.page.height - 40, { align: "center", width: doc.page.width - 100 });

        doc.end();
      });

      return {
        pdfBase64,
        filename: `${listing.title.replace(/[^a-z0-9]/gi, "_")}_Buyer_Report_${new Date().toISOString().slice(0, 10)}.pdf`,
      };
    }),
});
