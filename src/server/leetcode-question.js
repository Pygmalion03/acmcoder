import {htmlToText} from '../../shared/problem-text.js';
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

export {htmlToText};

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
