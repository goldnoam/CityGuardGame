import { GoogleGenAI, Type } from "@google/genai";
import { NewsReport } from "../types";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const generateNewsReport = async (
  level: number,
  buildingsLost: number,
  buildingsRemaining: number
): Promise<NewsReport> => {
  if (!process.env.API_KEY) {
    return {
      headline: "מערכת הדיווח מנותקת",
      description: "אנא וודא שמפתח ה-API מוגדר כראוי."
    };
  }

  try {
    const isCrisis = buildingsRemaining <= 1;
    const isPerfect = buildingsLost === 0;

    let tone = "serious and urgent";
    if (isPerfect) tone = "hopeful and triumphant";
    if (isCrisis) tone = "disastrous and panicked";

    const prompt = `
      You are a news reporter in a fictional city under missile attack.
      The current situation is:
      - Level passed: ${level}
      - Buildings destroyed in this attack: ${buildingsLost}
      - Buildings remaining standing: ${buildingsRemaining}
      - General Tone: ${tone}

      Generate a Breaking News flash in HEBREW (עברית).
      It should be dramatic.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING, description: "A short, catchy, dramatic headline in Hebrew" },
            description: { type: Type.STRING, description: "A 1-2 sentence summary of the situation in Hebrew" }
          },
          required: ["headline", "description"]
        }
      }
    });

    if (response.text) {
        return JSON.parse(response.text) as NewsReport;
    }
    
    throw new Error("No response text");

  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      headline: "דיווח מיוחד: הקרבות נמשכים",
      description: "כוחות ההגנה ממשיכים ליירט איומים על העיר. התושבים מתבקשים להישאר במרחבים המוגנים."
    };
  }
};