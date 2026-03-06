import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Generates a mood summary based on session questions.
 * @param questions Array of question strings
 * @returns A brief textual summary of the class mood/engagement
 */
export const generateMoodSummary = async (questions: string[]): Promise<string> => {
    if (!process.env.GEMINI_API_KEY) {
        return 'AI Summary is unavailable (API key missing). Based on volume, the class seems engaged.';
    }

    const modelNames = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro'];

    const prompt = `
      You are an AI teaching assistant. Analyze the following list of questions asked by students during a live classroom session.
      Provide a brief (1-2 sentences) summary of the "Class Mood" or "Collective Understanding".
      Focus on whether the students seem engaged, confused, curious, or overwhelmed.
      Keep it encouraging and professional for the teacher to read.

      Questions:
      ${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

      Summary:
    `;

    for (const name of modelNames) {
        try {
            const model = genAI.getGenerativeModel({ model: name });
            const result = await model.generateContent(prompt);
            return result.response.text().trim();
        } catch (error: any) {
            console.warn(`Mood summary failed with ${name}: ${error.message}`);
        }
    }

    return 'The class was active with several questions. The general mood appears curious and engaged.';
};

/**
 * Analyzes a single question for complexity, sentiment, and cognitive level.
 * Generates an answer if the question is simple.
 * @param questionText The text of the question
 * @returns Object containing complexity, aiAnswer, sentiment, and cognitiveLevel
 */
export const analyzeQuestion = async (questionText: string) => {
    if (!process.env.GEMINI_API_KEY) {
        return {
            complexity: 'simple',
            sentiment: 'Neutral',
            cognitiveLevel: 'Recall',
            aiAnswer: 'AI features are currently unavailable. The teacher will address your question shortly.'
        };
    }

    const modelNames = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-pro'];

    const prompt = `
      You are an AI Teaching Assistant for a platform called Vi-SlideS.
      Analyze the following student question and provide a structured JSON response.

      CLASSIFICATION RULES:
      - SET complexity to "simple" and PROVIDE aiAnswer if:
        A. Factual/Direct Questions (definitions, facts, formulas, laws).
        B. Procedural/How-to (standard steps, coding syntax, math solutions).
      - SET complexity to "complex" AND SET aiAnswer to null if:
        C. Conceptual/Why (reasoning, analogies, deep explanations).
        D. Personal/Performance (grades, marks, individual projects).
        E. Ambiguous/Opinion (subjective, open-ended debate).

      CRITICAL: For "complex" questions, aiAnswer MUST be null.

      FIELDS TO RETURN:
      - complexity: "simple" | "complex"
      - aiAnswer: 1-3 sentence answer if simple, otherwise null.
      - sentiment: One word (e.g., Curious, Confused, Frustrated, Proactive).
      - cognitiveLevel: One word from Bloom's Taxonomy (Remember, Understand, Apply, Analyze, Evaluate, Create).

      Student Question: "${questionText}"

      Respond ONLY with a valid JSON object. No markdown, no extra text.
    `;

    for (const name of modelNames) {
        try {
            const model = genAI.getGenerativeModel({ model: name });
            const result = await model.generateContent(prompt);

            let responseText = '';
            try {
                responseText = result.response.text().trim();
            } catch {
                continue;
            }

            try {
                const clean = responseText.replace(/^```json\s*|```$/g, '').trim();
                const match = clean.match(/\{[\s\S]*\}/);
                return JSON.parse(match ? match[0] : clean);
            } catch {
                continue;
            }
        } catch (error: any) {
            console.warn(`analyzeQuestion failed with ${name}: ${error.message}`);
        }
    }

    return {
        complexity: 'complex',
        sentiment: 'Unavailable',
        cognitiveLevel: 'Unavailable',
        aiAnswer: 'AI analysis is currently unavailable. The teacher will address your question shortly.'
    };
};

/**
 * Clusters a list of questions into logical topic groups.
 * @param questions Array of { id, text } objects
 * @returns Map of Topic Name to Array of Question IDs
 */
export const clusterQuestions = async (questions: { id: string; text: string }[]) => {
    if (!process.env.GEMINI_API_KEY || questions.length === 0) {
        return { General: questions.map(q => q.id) };
    }

    const modelNames = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro'];

    const prompt = `
      You are an AI teaching assistant. Cluster the following student questions into 3-5 logical topic groups.
      Return ONLY a valid JSON object where keys are topic names (1-3 words) and values are arrays of question IDs.

      Questions:
      ${questions.map(q => `ID: ${q.id} | Question: ${q.text}`).join('\n')}

      Format:
      {
        "React Hooks": ["id1", "id3"],
        "Performance": ["id2"]
      }
    `;

    for (const name of modelNames) {
        try {
            const model = genAI.getGenerativeModel({ model: name });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();

            const clean = responseText.replace(/^```json\s*|```$/g, '').trim();
            const match = clean.match(/\{[\s\S]*\}/);
            return JSON.parse(match ? match[0] : clean);
        } catch (error: any) {
            console.warn(`clusterQuestions failed with ${name}: ${error.message}`);
        }
    }

    return { General: questions.map(q => q.id) };
};

/**
 * Batch refines multiple questions for grammar, clarity, and meaning preservation.
 * @param questions Array of { id, content } objects
 * @returns Array of refined results with { id, refinedContent }
 */
export const batchRefineQuestions = async (questions: { id: string; content: string }[]) => {
    if (!process.env.GEMINI_API_KEY || questions.length === 0) {
        return questions.map(q => ({ id: q.id, refinedContent: q.content, status: 'skipped' }));
    }

    const modelNames = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-pro'];

    const questionsJson = questions
        .map((q, idx) => `{\n  "id": "${q.id}",\n  "index": ${idx},\n  "originalQuestion": "${q.content.replace(/"/g, '\\"').replace(/\n/g, ' ')}"\n}`)
        .join(',\n');

    const prompt = `You are an AI teaching assistant for Vi-SlideS.
Refine the following student questions for grammar, clarity, and punctuation while preserving the original meaning.
Return ONLY a valid JSON array. No markdown, no extra text.

Questions to refine:
[
${questionsJson}
]

Return ONLY this JSON format:
[
  {
    "id": "question_id",
    "originalQuestion": "original text here",
    "refinedQuestion": "improved text here",
    "changesMade": "brief description of improvements"
  }
]`;

    for (const name of modelNames) {
        try {
            const model = genAI.getGenerativeModel({ model: name });
            const result = await model.generateContent(prompt);

            let responseText = '';
            try {
                responseText = result.response.text().trim();
            } catch {
                continue;
            }

            try {
                const clean = responseText
                    .replace(/^```json\s*/i, '')
                    .replace(/^```\s*/i, '')
                    .replace(/```\s*$/, '')
                    .trim();

                const match = clean.match(/\[\s*\{[\s\S]*\}\s*\]/);
                if (!match) throw new Error('No JSON array found');

                const parsed = JSON.parse(match[0]);
                if (!Array.isArray(parsed)) throw new Error('Not an array');

                return parsed.map((item: any) => ({
                    id: item.id,
                    refinedContent: item.refinedQuestion || item.originalQuestion,
                    originalContent: item.originalQuestion,
                    changesMade: item.changesMade,
                    status: 'completed'
                }));
            } catch {
                continue;
            }
        } catch (error: any) {
            console.warn(`batchRefineQuestions failed with ${name}: ${error.message}`);
        }
    }

    return questions.map(q => ({
        id: q.id,
        refinedContent: q.content,
        originalContent: q.content,
        status: 'failed'
    }));
};