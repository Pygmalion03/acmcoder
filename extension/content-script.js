import {htmlToText} from '../shared/problem-text.js';

(function acmcoderContentScript() {
  if (window.__ACMCODER_CONTENT_SCRIPT_READY__) {
    return;
  }
  window.__ACMCODER_CONTENT_SCRIPT_READY__ = true;

  const LEETCODE_CN_ORIGIN = "https://leetcode.cn";
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

  const difficultyMap = {
    Easy: "easy",
    Medium: "medium",
    Hard: "hard",
    简单: "easy",
    中等: "medium",
    困难: "hard",
  };

  const tagNameMap = {
    Array: "数组",
    "Backtracking": "回溯",
    "Binary Search": "二分查找",
    "Breadth-First Search": "广度优先搜索",
    "Depth-First Search": "深度优先搜索",
    "Dynamic Programming": "动态规划",
    Greedy: "贪心",
    "Hash Table": "哈希表",
    "Linked List": "链表",
    Math: "数学",
    Queue: "队列",
    Stack: "栈",
    String: "字符串",
    Tree: "树",
    "Sliding Window": "滑动窗口",
    "Two Pointers": "双指针",
  };

  function compactText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function textFromFirst(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = compactText(element?.innerText || element?.textContent || "");
      if (text) return text;
    }
    return "";
  }

  function getSlug() {
    const match = location.pathname.match(/\/problems\/([^/]+)/);
    return match?.[1] || "";
  }

  function titleFromDocument() {
    return compactText(document.title)
      .replace(/\s*-?\s*力扣.*$/i, "")
      .replace(/\s*-?\s*LeetCode.*$/i, "")
      .replace(/^\d+\.\s*/, "");
  }

  function getTitle() {
    const title = textFromFirst([
      '[data-cy="question-title"]',
      '[data-testid="question-title"]',
      'a[href^="/problems/"] h1',
      "h1",
    ]);

    return (title || titleFromDocument()).replace(/^\d+\.\s*/, "");
  }

  function getContent() {
    const selectors = [
      '[data-track-load="description_content"]',
      '[data-testid="question-content"]',
      'div[class*="question-content"]',
      'div[class*="description"]',
      "main",
    ];
    for(const selector of selectors){
      const element=document.querySelector(selector);
      const content=htmlToText(element?.innerHTML);
      if(content)return compactText(content).slice(0,20000);
    }
    return compactText(htmlToText(document.body.innerHTML)||document.body.innerText).slice(0,20000);
  }

  function getDifficulty() {
    const body = document.body.innerText || "";
    for (const value of ["简单", "中等", "困难", "Easy", "Medium", "Hard"]) {
      if (new RegExp(`(^|\\s)${value}(\\s|$)`).test(body)) {
        return difficultyMap[value] || value;
      }
    }
    return "";
  }

  function normalizeDifficulty(value) {
    const difficulty = compactText(value);
    return difficultyMap[difficulty] || difficulty.toLowerCase();
  }

  function normalizeTagName(tag) {
    const name = compactText(tag?.translatedName || tag?.name || tag || "");
    return tagNameMap[name] || name;
  }

  function normalizeTags(question) {
    const graphTags = question?.topicTags?.map(normalizeTagName).filter(Boolean) || [];
    if (graphTags.length > 0) {
      return [...new Set(graphTags)];
    }

    return collectDomTags();
  }

  function collectDomTags() {
    const knownTags = new Set([
      "数组",
      "字符串",
      "哈希表",
      "动态规划",
      "双指针",
      "栈",
      "队列",
      "贪心",
      "二分查找",
      "滑动窗口",
      "树",
      "深度优先搜索",
      "广度优先搜索",
      "回溯",
      "链表",
      "数学",
      ...Object.keys(tagNameMap),
    ]);
    const tags = new Set();
    document.querySelectorAll('a[href*="/tag/"], a[href*="/tag/"] *').forEach((element) => {
      const text = compactText(element.innerText || element.textContent || "");
      if (knownTags.has(text)) {
        tags.add(tagNameMap[text] || text);
      }
    });
    return [...tags];
  }

  function cleanExampleValue(value) {
    return compactText(value)
      .replace(/^[a-zA-Z_][\w]*\s*=\s*/, "")
      .replace(/^"(.*)"$/, "$1");
  }

  function extractFirstExample(content) {
    const input = content.match(/输入[:：]\s*([^\n]+)/);
    const output = content.match(/输出[:：]\s*([^\n]+)/);
    if (!input && !output) {
      return null;
    }

    return {
      inputText: input ? cleanExampleValue(input[1]) : "",
      outputText: output ? cleanExampleValue(output[1]) : "",
    };
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(response);
      });
    });
  }

  async function fetchQuestionDataViaBackground(slug) {
    const response = await sendRuntimeMessage({
      type: "ACMCODER_FETCH_QUESTION_DATA",
      slug,
      origin: location.origin,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Background question fetch failed.");
    }

    return response.question || null;
  }

  async function fetchQuestionDataDirect(origin, slug) {
    const response = await fetch(`${origin}/graphql/`, {
      method: "POST",
      credentials: "include",
      signal: AbortSignal.timeout(10000),
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        operationName: "questionData",
        variables: { titleSlug: slug },
        query: QUESTION_QUERY,
      }),
    });

    if (!response.ok) {
      throw new Error(`LeetCode GraphQL returned ${response.status}`);
    }

    const body = await response.json();
    return body?.data?.question || null;
  }

  async function fetchQuestionData(slug) {
    try {
      const question = await fetchQuestionDataViaBackground(slug);
      if (question) return question;
    } catch {
      // Fall back to direct page requests below.
    }

    const origins = [LEETCODE_CN_ORIGIN, location.origin].filter((origin, index, list) => {
      return origin && /^https:\/\/leetcode\.(cn|com)$/.test(origin) && list.indexOf(origin) === index;
    });

    for (const origin of origins) {
      try {
        const question = await fetchQuestionDataDirect(origin, slug);
        if (question) return question;
      } catch {
        // Try the next source before falling back to DOM text.
      }
    }

    return null;
  }

  async function captureLeetCodeProblem() {
    const capturedUrl = location.href;
    const slug = getSlug();
    let question = null;
    try {
      question = await fetchQuestionData(slug);
    } catch {
      question = null;
    }

    const content = compactText(
      htmlToText(question?.translatedContent) || htmlToText(question?.content) || getContent(),
    ).slice(0, 20000);
    const tags = normalizeTags(question);
    const difficulty = normalizeDifficulty(question?.difficulty || getDifficulty());

    if(location.href!==capturedUrl||getSlug()!==slug)throw new Error("读取期间页面已切题，请再次读取。");
    return {
      source: "leetcode",
      url: capturedUrl,
      slug,
      frontendId: question?.questionFrontendId || "",
      title: question?.translatedTitle || question?.title || getTitle() || slug,
      difficulty,
      tags,
      sample: extractFirstExample(content),
      content,
      capturedAt: new Date().toISOString(),
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "ACMCODER_CAPTURE") {
      return false;
    }

    captureLeetCodeProblem()
      .then((page) => {
        sendResponse({ ok: true, page });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  });
})();
