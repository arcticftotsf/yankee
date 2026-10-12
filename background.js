// ===== 設定 =====
const ITEM_SELECTOR = ".blog-menu__item.-view.box02"; // 対象要素
const CLICK_TEXT = "ブログランキング";                 // クリックしたい文字
const OPEN_INTERVAL_MS = 500;                           // タブを開く間隔
const RETRY_COUNT = 10;                                 // 文字が見つからない時の再試行回数
const RETRY_INTERVAL_MS = 500;
// ================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 拡張アイコンをクリック
chrome.action.onClicked.addListener(async (tab) => {
  // 1. 現在のページから対象要素のURLを集める
  const [{ result: urls } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (selector) => {
      const urls = [];
      document.querySelectorAll(selector).forEach((el) => {
        const a = el.matches("a[href]") ? el : el.querySelector("a[href]");
        if (a && a.href) urls.push(a.href);
      });
      return [...new Set(urls)];
    },
    args: [ITEM_SELECTOR],
  });

  if (!urls || urls.length === 0) {
    console.warn("対象要素が見つかりませんでした:", ITEM_SELECTOR);
    return;
  }

  // 2. 順番に新しいタブで開き、ページ読み込み後にクリック処理
  for (const url of urls) {
    const newTab = await chrome.tabs.create({ url, active: false });
    handleTab(newTab.id); // 待たずに並行処理
    await sleep(OPEN_INTERVAL_MS);
  }
});

// タブの読み込み完了を待って「ブログランキング」をクリック
async function handleTab(tabId) {
  await waitForComplete(tabId);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: clickByText,
      args: [CLICK_TEXT, RETRY_COUNT, RETRY_INTERVAL_MS],
    });
  } catch (e) {
    console.warn("スクリプト実行失敗:", tabId, e);
  }
}

function waitForComplete(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => {
      if (t.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

// ページ内で実行される関数(自己完結させる)
async function clickByText(text, retries, interval) {
  const find = () => {
    // テキストノードから探す
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.includes(text)) {
        const p = walker.currentNode.parentElement;
        return p.closest("a, button") || p;
      }
    }
    // 画像の alt / title から探す
    const img = [...document.querySelectorAll("img[alt], [title]")].find(
      (e) => (e.alt || e.title || "").includes(text)
    );
    return img ? img.closest("a, button") || img : null;
  };

  for (let i = 0; i < retries; i++) {
    const el = find();
    if (el) {
      el.click();
      return true;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}
