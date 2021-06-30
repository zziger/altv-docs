// Copyright (c) Microsoft. All rights reserved. Licensed under the MIT license. See LICENSE file in the project root for full license information.
/*
 * Swap to div is necessary to skip code highlight process.
 */
$(".lang-mermaid").each(function() {
  const oldEl = $(this);
  const newEl = $("<div>");
  $.each(this.attributes, function(i, attr) { newEl.attr(attr.name, attr.value); });
  newEl.html(oldEl.html());
  oldEl.replaceWith(newEl);
});

/*
 * Remove rel metadata temporarily for DocFx script to disable search function
 */
var rel = $("meta[property='docfx\\:rel']").detach();

const filterKeywords = {
  "type": "api,article",
  "title": "title",
  "keywords": "keywords",
  "langs": "js,ts,cs,lua"
};
const filterRegex = new RegExp("(\\w+):\\s*(\\w+)?", "gi")

const darkThemeMq = window.matchMedia("(prefers-color-scheme: dark)");
switchTheme();

var query;
var worker;
var relHref;

$(document).ready(function() {
  darkThemeMq.addEventListener("change", switchTheme());
  highlight();
  renderAffix();
  renderTabs();
  renderFlowcharts();
  enableSearch();
  $("a:not([data-tab])").off("click").on("click", delegateAnchors);
  $(".blackout").on("click", toggleMenu);
  $(".navbar-toggler").on("click", toggleMenu);
});
$(window).on("load hashchange", function() {
  scrollIfAnchor(window.location.hash);
});

window.refresh = function(article) {
  highlight();
  renderAffix();
  renderTabs();
  renderFlowcharts();
}

function switchTheme(theme) {
  const curTheme = theme || localStorage.getItem("theme") || "auto";
  let themes = ["dark", "light"];
  if ((curTheme === "auto" && !darkThemeMq.matches) || curTheme === "light") themes = themes.reverse();
  $(document.documentElement).addClass("theme-" + themes[0]);
  $(document.documentElement).removeClass("theme-" + themes[1]);
  $("#theme-menu .theme-option").removeClass("active");
  $("#theme-menu .theme-option." + curTheme).addClass("active");
  $("link[href*='highlight.js'][href*='styles'][href*='-" + themes[0] + "']").removeAttr("disabled");
  $("link[href*='highlight.js'][href*='styles'][href*='-" + themes[1] + "']").attr("disabled", "disabled");
}

function enableSearch() {
  $("head").append(rel);
  relHref = $("meta[property='docfx\\:rel']").attr("content");
  if (typeof relHref === "undefined") {
    return;
  }
  try {
    worker = new Worker(relHref + "styles/search-worker.js");
    if (!worker && !window.worker) {
      localSearch();
    } else {
      webWorkerSearch(worker);
    }

    for (const key of Object.keys(filterKeywords)) {
      $("#search-menu").append("<div class=\"option\"><span class=\"filter\">"
       + key + ":</span><span class=\"answer\">"
        + filterKeywords[key] + "</span></div>");
    }

    // renderSearchBox();
    // highlightKeywords();
    addSearchEvent();
  } catch (e) {
    console.error(e);
  }
}

// Search factory
function localSearch() {
  console.debug("using local search");
  var lunrIndex = lunr(function() {
    this.ref("href");
    this.field("type", { boost: 100 });
    this.field("title", { boost: 50 });
    this.field("keywords", { boost: 25 });
    this.field("langs", { boost: 75 });
  });
  lunr.tokenizer.seperator = /[\s\-\.]+/;
  var searchData = {};
  var searchDataRequest = new XMLHttpRequest();

  var indexPath = relHref + "index.json";
  if (indexPath) {
    searchDataRequest.open("GET", indexPath);
    searchDataRequest.onload = function() {
      if (this.status != 200) {
        return;
      }
      searchData = JSON.parse(this.responseText);
      for (var prop in searchData) {
        if (searchData.hasOwnProperty(prop)) {
          lunrIndex.add(searchData[prop]);
        }
      }
    }
    searchDataRequest.send();
  }

  $("body").bind("queryReady", function() {
    var hits = lunrIndex.search(query);
    var results = [];
    hits.forEach(function(hit) {
      var item = searchData[hit.ref];
      results.push({ "type": item.type, "href": item.href, "title": item.title, "keywords": item.keywords, "langs": item.langs });
    });
    handleSearchResults(results);
  });
}

function webWorkerSearch() {
  console.debug("using Web Worker");
  var indexReady = $.Deferred();

  worker.onmessage = function(oEvent) {
    switch (oEvent.data.e) {
      case "index-ready":
        indexReady.resolve();
        break;
      case "query-ready":
        var hits = oEvent.data.d;
        handleSearchResults(hits);
        break;
    }
  }

  indexReady.promise().done(function() {
    $("body").bind("queryReady", function() {
      worker.postMessage({ q: query });
    });
    if (query && (query.length >= 3)) {
      worker.postMessage({ q: query });
    }
  });
}

function addSearchEvent() {
  $("body").off("searchEvent").bind("searchEvent", function() {
    $("#search-query").off("keypress keyup").keyup(function(ev) {
      if (ev.which !== 13) return;
      ev.preventDefault();
      query = $(this).text();
      if (query.length < 3) {
        flipContents("show");
      } else if (isSearchQueryValid(this)) {
        flipContents("hide");
        $("body").trigger("queryReady");
        $("#search-results > .search-list > span").text("\"" + query + "\"");
      }
    });
  });
  $("#search-query").on("focusin", function(ev) {
    const el = $(this);
    if (el.text() !== "") return;
    $("#search-menu").addClass("active");
    $(".btn-link.search").toggleClass("active", isSearchQueryValid(this));
  });
  $("#search-menu .option").on("mousedown", function(ev) {
    const el = $(this).find(".filter");
    if (!el.length) return;
    ev.preventDefault();
    const searchInput = $("#search-query");
    searchInput.text(searchInput.text() + el.text());
    addSearchKeyword(searchInput);
    setCurrentCursorPosition(searchInput[0], searchInput.text().length);
    $("#search-menu").removeClass("active");
  });
  $("#search-query").on("focusout", function(ev) {
    $("#search-menu").removeClass("active");
  });
  $("#search-query").on("keydown", function(ev) {
    const el = $(ev.currentTarget);
    const prevVal = el.data("text");
    const curVal = el.text();
    $("#search-query-clear").toggleClass("active", ev.currentTarget.innerText.length > 0);
    $("#search-menu").toggleClass("active", ev.currentTarget.innerText.length == 0);
    $(".btn-link.search").toggleClass("active", isSearchQueryValid(ev.currentTarget) && prevVal != curVal);
    $("#theme-menu").removeClass("active");
    $(ev.currentTarget).data("text", curVal);
  });
  $("#search-query").on("input", function(ev) {
    const pos = getCurrentCursorPosition(ev.currentTarget);
    addSearchKeyword(ev.currentTarget);
    setCurrentCursorPosition(ev.currentTarget, pos);
  });
  $("body").on("searchEvent", function() {
    $("#search").removeAttr("style");
  });
  $("body").on("queryReady", function() {
    $("#search-menu").removeClass("show");
  });
  $("#pagination").on("page", function(evt, page) {
    $(".content-column").scrollTop(0);
  });
  $(".btn-link.search-back").on("click", toggleSearch);
  $(".btn-link.search-tip").on("click", toggleSearch);
  $(".btn-link.search").on("click", function() {
    $("#search-query").trigger($.Event("keyup", {which: 13}));
    $(".btn-link.search").toggleClass("active");
  });
  $("#search-query-clear").on("mousedown", function(ev) {
    ev.preventDefault();
    $("#search-query").focus();
  });
  $("#search-query-clear").on("click", function(ev) {
    ev.preventDefault();
    $("#search-query").text("").trigger("keydown").trigger("input");
  });
  $(".btn-link.theme").on("click", function(ev) {
    ev.preventDefault();
    $("#theme-menu").toggleClass("active");
  });
  $("#theme-menu .theme-option").on("mousedown", function(ev) {
    ev.preventDefault();
    const selTheme = $(this).attr("data-theme");
    if (selTheme === "auto") {
      localStorage.removeItem("theme");
    } else {
      localStorage.setItem("theme", selTheme);
    }
    switchTheme();
    $("#theme-menu").removeClass("active");
  });
  $(document).click(function(ev) {
    if ($(ev.target).is("#theme-menu") || $(ev.target).is(".btn-link.theme")) return;
    $("#theme-menu").removeClass("active");
  });
  $(window).on("resize", function() {
    const searchQuery = $("#search-query");
    if ($(this).width() >= 1024) {
      $(".btn-link.search-back").click();
    } else if (searchQuery.is(":focus") || searchQuery.text() !== "") {
      $(".btn-link.search-tip").click();
    }
  });
}

function toggleSearch() {
  const el = $(this);
  const z = $(".btn-link.search-back");
  const w = $("#search");
  if (el?.hasClass("search-back")) {
    z?.removeClass("active");
    w?.removeClass("float");
    flipContents("show");
    $("#search-query").text("");
  } else if (el?.hasClass("search-tip")) {
    z?.addClass("active");
    w?.addClass("float");
  }
}

function addSearchKeyword(el) {
  let str = $(el).text();
  for (const word of str.matchAll(filterRegex)) {
    if (Object.keys(filterKeywords).indexOf(word[1]) === -1) continue;
    str = str.replaceAll(word[1] + ":", "<span class=\"keyword " + word[1] + "\">" + word[1] + ":</span>");
  }
  $(el).html(str).trigger("keydown");
}

function isSearchQueryValid(el) {
  if (!$(el).length) return false;
  const str = $(el).text();
  const keywords = str.matchAll(filterRegex);
  for (const word of keywords) {
    if (Object.keys(filterKeywords).indexOf(word[1]) === -1 || word[2] == null) return false;
  }
  return str.length >= 3;
}

function flipContents(action) {
  if (action === "show") {
    $(".hide-when-search").show();
    $("#search-results").hide();
  } else {
    $(".hide-when-search").hide();
    $("#search-results").show();
  }
}

function createRange(node, offset, range) {
  const ptr = isNaN(offset) ? offset : { value: offset };
  if (!range) {
    range = document.createRange();
    range.selectNode(node);
    range.setStart(node, 0);
  }
  if (ptr.value === 0) {
      range.setEnd(node, ptr.value);
  } else if (node && ptr.value > 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.length < ptr.value) {
        ptr.value -= node.textContent.length;
      } else {
        range.setEnd(node, ptr.value);
        ptr.value = 0;
      }
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        range = createRange(node.childNodes[i], ptr, range);
        if (ptr.value === 0) break;
      }
    }
  }
  return range;
}

function isChildOf(node, parentNode) {
  while (node !== null) {
    if (node.id === parentNode.id) return true;
    node = node.parentNode;
  }
  return false;
}

function getCurrentCursorPosition(el) {
  const selection = window.getSelection();
  let charCount = -1;
  let node = selection.focusNode;
  if (!node || !isChildOf(node, el)) return charCount; 
  charCount = selection.focusOffset;
  while (node) {
    if (node.id === el.id) break;
    if (node.previousSibling) {
      node = node.previousSibling;
      charCount += node.textContent.length;
    } else {
      node = node.parentNode;
      if (node === null) break;
    }
  }
  return charCount;
}

function setCurrentCursorPosition(el, offset) {
  if (offset < 0) return;
  const selection = window.getSelection();
  const range = createRange(el, offset);
  if (!range) return;
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function handleSearchResults(hits) {
  var numPerPage = 10;
  var pagination = $("#pagination");
  pagination.empty();
  pagination.removeData("twbs-pagination");
  if (hits.length === 0) {
    $("#search-results > .sr-items").html("<p>No results found</p>");
  } else {        
    pagination.twbsPagination({
      first: pagination.data("first"),
      prev: pagination.data("prev"),
      next: pagination.data("next"),
      last: pagination.data("last"),
      totalPages: Math.ceil(hits.length / numPerPage),
      visiblePages: 5,
      onPageClick: function (event, page) {
        var start = (page - 1) * numPerPage;
        var curHits = hits.slice(start, start + numPerPage);
        $("#search-results > .sr-items").empty().append(
          curHits.map(function (hit) {
            var currentUrl = window.location.href;
            var itemRawHref = relativeUrlToAbsoluteUrl(currentUrl, relHref + hit.href);
            var itemHref = relHref + hit.href + "?q=" + query;
            var itemTitle = hit.title;
            var itemBrief = extractContentBrief(hit.keywords);

            var itemNode = $("<div>").attr("class", "sr-item");
            var itemTitleNode = $("<div>").attr("class", "item-title").append($("<a>").attr("href", itemHref).attr("target", "_blank").text(itemTitle));
            var itemHrefNode = $("<div>").attr("class", "item-href").text(itemRawHref);
            var itemBriefNode = $("<div>").attr("class", "item-brief").text(itemBrief);
            itemNode.append(itemTitleNode).append(itemHrefNode).append(itemBriefNode);
            return itemNode;
          })
        );
        query.split(/\s+/).forEach(function (word) {
          if (word !== "") {
            $("#search-results > .sr-items *").mark(word);
          }
        });
      }
    });
  }
}

function relativeUrlToAbsoluteUrl(currentUrl, relativeUrl) {
  var currentItems = currentUrl.split(/\/+/);
  var relativeItems = relativeUrl.split(/\/+/);
  var depth = currentItems.length - 1;
  var items = [];
  for (var i = 0; i < relativeItems.length; i++) {
    if (relativeItems[i] === "..") {
      depth--;
    } else if (relativeItems[i] !== '.') {
      items.push(relativeItems[i]);
    }
  }
  return currentItems.slice(0, depth).concat(items).join('/');
}

function extractContentBrief(content) {
  var briefOffset = 512;
  var words = query.split(/\s+/g);
  var queryIndex = content.indexOf(words[0]);
  var briefContent;
  if (queryIndex > briefOffset) {
    return "..." + content.slice(queryIndex - briefOffset, queryIndex + briefOffset) + "...";
  } else if (queryIndex <= briefOffset) {
    return content.slice(0, queryIndex + briefOffset) + "...";
  }
}

function highlight() {
  $("code.hljs").each(function(i, block) {
    hljs.lineNumbersBlock(block);
  });
}

function renderFlowcharts() {
  if (typeof mermaid === "undefined") return;
  const style = getComputedStyle(document.documentElement);
  mermaid.initialize({
    theme: "base",
    themeVariables: {
      primaryColor: style.getPropertyValue("--diagr-primary-color").slice(1),
      primaryBorderColor: style.getPropertyValue("--diagr-primary-border-color").slice(1),
      primaryTextColor: style.getPropertyValue("--diagr-primary-text-color").slice(1),
      secondaryColor: style.getPropertyValue("--diagr-secondary-color").slice(1),
      secondaryBorderColor: style.getPropertyValue("--diagr-secondary-border-color").slice(1),
      secondaryTextColor: style.getPropertyValue("--diagr-secondary-text-color").slice(1),
      tertiaryColor: style.getPropertyValue("--diagr-tertiary-color").slice(1),
      tertiaryBorderColor: style.getPropertyValue("--diagr-tertiary-border-color").slice(1),
      lineColor: style.getPropertyValue("--diagr-line-color").slice(1)
    },
    startOnLoad: false
  });
  mermaid.init(undefined, ".lang-mermaid");
}

function renderTabs() {
  if ($(".tabGroup").length > 0) removeTabQuery();
  $(".tabGroup > ul > li > a").each(function() {
    const el = $(this);
    el.attr("href", '#');
    checkTabCode(el);
    checkTabActive(el);
  });
  document.body.addEventListener("click", function(ev) {
    if (!(ev.target instanceof HTMLElement)) return;
    const tabId = $(ev.target).closest("a[data-tab]").attr("data-tab");
    if (!tabId) return;
    const tab = $(".tabGroup a[data-tab=\"" + tabId + "\"]");
    tab.each(function() {
      const el = $(this);
      el.attr("href", '#').attr("aria-controls", "");
      checkTabActive(el);
    });
    removeTabQuery();
  });
}

function removeTabQuery() {
  const url = location.protocol + "//" + location.host + location.pathname + location.hash;
  if (location.href === url) return;
  history.replaceState({}, document.title, url);
}

function checkTabCode(el) {
  const tabId = el.attr("data-tab");
  if (!tabId) return;
  const tabContent = el.closest(".tabGroup").find("> section[data-tab=\"" + tabId + "\"]");
  if (tabContent.children().length != 1 || tabContent.children().find("code").length == 0) return;
  tabContent.addClass("code");
  el.parent().addClass("code");
}

function checkTabActive(el) {
  if (el.attr("aria-selected") !== "true") return;
  el.parent().parent().children().removeClass("active");
  el.parent().addClass("active");
}

function renderAffix() {
  $("#affix").removeAttr("style");
  const tree = traverseArticle();
  const el = $(".sideaffix");
  if (!el) return;
  if (!tree || !tree.length || tree.length == 1 && !tree[0].children.length) {
    el.hide();
  } else {
    el.show();
    el.find(".affix").html(formList(tree, ["nav", "bs-docs-sidenav"]));
  }

  function traverseArticle() {
    const isConceptual = $(".content-column").hasClass("Conceptual");
    let headers = $(["h1", "h2", "h3", "h4"].map(el => "article.content " + el).join(", "));
    let stack = [];
    let curr = {};
    headers.each(function () {
      const el = $(this);
      const xref = el.children().length > 1 ? el.children().last() : null;
      const obj = {
        parent: curr,
        type: el.prop("tagName"),
        id: el.prop("id"),
        name: htmlEncode(el.text()),
        href: xref?.hasClass("xref") ? xref.prop("href") : "#" + el.prop("id"),
        children: []
      };
      if (!stack.length) {
        stack.push(curr = obj);
        return;
      }
      if (obj.type === stack[stack.length - 1].type) {
        stack.push(curr = obj);
      } else if (obj.type > curr.type) {
        curr.children.push(curr = obj);
      } else if (obj.type < curr.type) {
        obj.parent = curr.parent.parent;
        curr.parent.parent.children.push(curr = obj);
      } else {
        curr.parent.children.push(obj);
      }
    });

    return stack.length && !isConceptual ? stack[0].children : stack;
  }

  function formList(item, classes) {
    var level = 1;
    return getList({ children: item }, [].concat(classes).join(" "));

    function getList(model, cls) {
      if (!model || !model.children) return null;
      let l = model.children.length;
      if (l === 0) return null;
      let html = "<ul class=\"" + ["level" + level++, cls, model.id].filter(el => el != null).join(' ') + "\">";
      for (let i = 0; i < l; i++) {
        let item = model.children[i];
        let href = item.href;
        let name = item.name;
        if (!name) continue;
        html += href ? "<li><a href=\"" + href + "\">" + name.trim() + "</a>" : "<li>" + name;
        let lvl = level;
        html += getList(item, cls) || "";
        level = lvl;
        html += "</li>";
      }
      level = 1;
      html += "</ul>";
      return html;
    }
  }
}

function htmlEncode(str) {
  if (!str) return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlDecode(value) {
  if (!str) return str;
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function toggleMenu() {
  const el = !this.classList.contains("blackout") ? $(this) : null;
  const x = $(".main-panel");
  const b = $(".blackout");
  el?.toggleClass("active");
  x.toggleClass("expand");
  b.toggleClass("active");
}

var HISTORY_SUPPORT = !!(history && history.pushState);

function scrollIfAnchor(link, pushToHistory) {
  if (!/^#[^ ]+$/.test(link)) return false;
  const match = document.getElementById(link.slice(1));
  if (!match) return false;
  $(".content-column").scrollTop(match.offsetTop);
  if (HISTORY_SUPPORT && pushToHistory) history.pushState({}, document.title, location.pathname + link);
  return true;
}

function delegateAnchors(ev) {
  if (!scrollIfAnchor(ev.target.getAttribute("href"), true)) return;
  ev.preventDefault();
}
