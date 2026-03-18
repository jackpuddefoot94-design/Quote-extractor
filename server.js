import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "20mb" }));

app.get("/", (req, res) => res.json({ status: "ok" }));

app.post("/extract", async (req, res) => {
  const { fileData, fileType } = req.body;
  if (!fileData || !fileType) return res.status(400).json({ error: "Missing file data" });

  const isPdf = fileType === "application/pdf";
  const contentBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileData } }
    : { type: "image", source: { type: "base64", media_type: fileType, data: fileData } };

  const prompt = `Extract all line items from this supplier quote. Return ONLY valid JSON, no markdown or explanation.

Format:
{
  "items": [
    {
      "part_number": "string or empty string",
      "description": "full product name and description",
      "quantity": number,
      "unit_price_ex_gst": number,
      "line_value_ex_gst": number
    }
  ]
}

Rules:
- unit_price_ex_gst = price per single unit, ex GST
- If quote shows price per 10/100/1000, divide to get per-unit price
- If price includes GST, divide by 1.1 to get ex-GST
- line_value_ex_gst = unit_price_ex_gst * quantity
- All prices as plain numbers, no $ signs`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }],
    });

    const text = message.content.map(b => b.text || "").join("");
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
