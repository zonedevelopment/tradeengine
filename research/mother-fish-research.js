const fs = require("fs");
const path = require("path");
const { analyzeMotherFishWithGemini } = require("../gemini");

const sourceFile = path.join(__dirname, "sources.json");
const outputFile = path.join(__dirname, "mother-fish-state.json");

function safeReadJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        const raw = fs.readFileSync(file, "utf8").trim();
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (err) {
        console.log("safeReadJson error:", file, err.message);
        return fallback;
    }
}

async function runMotherFishResearch() {
    const sources = safeReadJson(sourceFile, []);

    const prompt = `
คุณเป็นนักวิจัยระบบเทรดที่ต้องศึกษาระบบ "แม่ปลาปากกาเขียว"

เป้าหมายของคุณ:
- อย่าสรุปกฎเดิมซ้ำแบบเดิม ๆ
- ต้องแยก "สิ่งที่รู้อยู่แล้ว" ออกจาก "ข้อมูลใหม่"
- ต้องพยายามหา refinement หรือรายละเอียดที่ทำให้ระบบดีขึ้น
- ถ้าไม่พบข้อมูลใหม่จริง ๆ ให้ระบุว่าไม่พบข้อมูลใหม่
- ถ้าข้อมูลขัดแย้งกัน ให้แยกไว้ใน conflicts
- ถ้าพบคำถามที่ยังตอบไม่ได้ ให้เก็บไว้ใน openQuestions

ให้ตอบเป็น JSON เท่านั้น
ห้ามมี markdown
ห้ามมีคำอธิบายนอก JSON

รูปแบบ JSON:
{
  "summary": "สรุปภาพรวมระบบแบบกระชับ",
  "knownRules": [
    "..."
  ],
  "newFindings": [
    "..."
  ],
  "conflicts": [
    "..."
  ],
  "openQuestions": [
    "..."
  ],
  "suggestedSourceTargets": [
    "..."
  ],
  "coreRules": {
    "bodyCloseThreshold": 0.5,
    "mustBeNearSupportResistance": true,
    "mustNotBeMiddleRange": true,
    "preferredTimeframes": ["M5", "M15"]
  },
  "refinements": {
    "entryQualityFactors": [],
    "invalidConditions": [],
    "sessionPreferences": [],
    "newsConditions": [],
    "momentumConditions": [],
    "exitIdeas": []
  },
  "buyRules": [],
  "sellRules": [],
  "avoidRules": [],
  "notes": [],
  "confidence": 0.0
}

กติกาสำคัญ:
1. knownRules = สิ่งที่เป็นแกนหลักซึ่งรู้อยู่แล้ว
2. newFindings = เฉพาะสิ่งใหม่หรือ refinement ใหม่
3. conflicts = สิ่งที่แต่ละแหล่งพูดไม่ตรงกัน
4. openQuestions = สิ่งที่ยังต้องหาข้อมูลเพิ่ม
5. suggestedSourceTargets = หัวข้อที่ควรไปค้นต่อ
6. confidence ให้เป็นเลข 0 ถึง 1

ข้อมูลสำหรับวิจัย:
${JSON.stringify(sources, null, 2)}
`;

    const raw = await analyzeMotherFishWithGemini(process.env.GEMINI_API_KEY, prompt);

    const cleaned = String(raw || "")
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    const parsed = JSON.parse(cleaned);

    const result = {
        updatedAt: new Date().toISOString(),
        sourceCount: sources.length,
        ...parsed
    };

    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), "utf8");

    console.log("mother-fish-research done");
    console.log("sourceCount:", sources.length);
    console.log("newFindings:", Array.isArray(result.newFindings) ? result.newFindings.length : 0);
    console.log("conflicts:", Array.isArray(result.conflicts) ? result.conflicts.length : 0);
    console.log("openQuestions:", Array.isArray(result.openQuestions) ? result.openQuestions.length : 0);

    return result;
}

if (require.main === module) {
    runMotherFishResearch().catch((err) => {
        console.error("mother-fish-research error:", err.message);
    });
}

module.exports = { runMotherFishResearch };