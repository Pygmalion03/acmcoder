const LEETCODE_GRAPHQL_URL = "https://leetcode.cn/graphql/";

const QUESTION_QUERY = `query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    title
    translatedTitle
    difficulty
    content
    translatedContent
    topicTags {
      name
      translatedName
      slug
    }
  }
}`;

const namedEntities = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeHtmlEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== "#") {
      return namedEntities[entity.toLowerCase()] ?? match;
    }

    const hexadecimal = entity[1]?.toLowerCase() === "x";
    const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
  });
}

export function htmlToText(html) {
  return decodeHtmlEntities(
    String(html || "")
    .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*sup\b[^>]*>/gi, "^")
    .replace(/<\s*li\b[^>]*>/gi, "- ")
    .replace(/<\s*\/\s*(p|div|pre|li|ul|ol|h[1-6]|table|tr)\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim(),
  );
}

function extractFirstSample(content) {
  const input = content.match(/(?:输入|Input)[:：]\s*([^\n]+)/i);
  const output = content.match(/(?:输出|Output)[:：]\s*([^\n]+)/i);
  if (!input && !output) {
    return null;
  }

  return {
    inputText: input?.[1]?.trim() || "",
    outputText: output?.[1]?.trim() || "",
  };
}

function normalizeDifficulty(value) {
  const difficulty = String(value || "").trim().toLowerCase();
  return {
    easy: "easy",
    medium: "medium",
    hard: "hard",
    "简单": "easy",
    "中等": "medium",
    "困难": "hard",
  }[difficulty] || difficulty;
}

export async function fetchLeetCodeQuestionPage(
  slug,
  url,
  { fetch = globalThis.fetch, now = () => new Date() } = {},
) {
  const response = await fetch(LEETCODE_GRAPHQL_URL, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      "content-type": "application/json",
      referer: url,
    },
    body: JSON.stringify({
      operationName: "questionData",
      variables: { titleSlug: slug },
      query: QUESTION_QUERY,
    }),
  });

  if (!response.ok) {
    throw new Error(`LeetCode 题面请求失败（${response.status}）。`);
  }

  const body = await response.json();
  const question = body?.data?.question;
  if (!question) {
    throw new Error(`LeetCode 没有返回题目 ${slug}。`);
  }

  const content = htmlToText(question.translatedContent || question.content);
  if (!content) {
    throw new Error(`LeetCode 没有返回题目 ${slug} 的完整题面。`);
  }

  return {
    source: "leetcode",
    url,
    slug,
    frontendId: String(question.questionFrontendId || ""),
    title: question.translatedTitle || question.title || slug,
    difficulty: normalizeDifficulty(question.difficulty),
    tags: (question.topicTags || [])
      .map((tag) => String(tag.translatedName || tag.name || "").trim())
      .filter(Boolean),
    sample: extractFirstSample(content),
    content,
    capturedAt: now().toISOString(),
  };
}
