const SIDE_PANEL_PATH = "workspace.html";
const LEETCODE_CN_ORIGIN = "https://leetcode.cn";
const LOCAL_BASE = "http://127.0.0.1:43117";

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

function isLeetCodeProblemUrl(url = "") {
  return /^https:\/\/leetcode\.(cn|com)\/problems\/[^/]+/.test(url);
}

async function setDefaultSidePanelOpen() {
  if (chrome.sidePanel?.setOptions) {
    await chrome.sidePanel
      .setOptions({
        path: SIDE_PANEL_PATH,
        enabled: true,
      })
      .catch(() => {});
  }

  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
}

async function openLocalAcmcoderTab() {
  await chrome.tabs.create({ url: chrome.runtime.getURL(SIDE_PANEL_PATH) }).catch(() => {});
}

async function openAcmcoderForTab(tab) {
  await configureSidePanelDefaults();

  if (chrome.sidePanel?.open && Number.isInteger(tab?.windowId)) {
    await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    return;
  }

  await openLocalAcmcoderTab();
}

async function fetchQuestionDataFrom(origin, slug) {
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

async function fetchCanonicalQuestionData(slug, pageOrigin) {
  const origins = [pageOrigin, LEETCODE_CN_ORIGIN].filter((origin, index, list) => {
    return origin && /^https:\/\/leetcode\.(cn|com)$/.test(origin) && list.indexOf(origin) === index;
  });

  for (const origin of origins) {
    try {
      const question = await fetchQuestionDataFrom(origin, slug);
      if (question) {
        return question;
      }
    } catch {
      // Try the next origin. LeetCode can vary by region and login state.
    }
  }

  return null;
}

async function configureSidePanelDefaults() {
  await setDefaultSidePanelOpen();
}

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanelDefaults();
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanelDefaults();
});

chrome.action.onClicked.addListener((tab) => {
  openAcmcoderForTab(tab);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ACMCODER_PANEL_OPENED") {
    sendResponse({ ok: true, isProblemPage: isLeetCodeProblemUrl(message.url || "") });
    return true;
  }

  if (message?.type !== "ACMCODER_FETCH_QUESTION_DATA") {
    return false;
  }

  const requestedUrl=`${message.origin}/problems/${message.slug}/`;
  if(sender.id!==chrome.runtime.id||!/^https:\/\/leetcode\.(cn|com)$/.test(message.origin||'')||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(message.slug||'')||
     (sender.tab&&!String(sender.tab.url||'').startsWith(requestedUrl))){
    sendResponse({ok:false,error:'题目来源不匹配。'});return false;
  }
  fetchCanonicalQuestionData(message.slug, message.origin)
    .then((question) => sendResponse({ ok: true, question }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
