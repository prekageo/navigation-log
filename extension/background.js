var urlFromTab = {};
var sourceTabId = {};
var extra = {};
var port;
var started = false;
var DEBUG = false;
var optin_incognito = false;
var allowedTabs = new Set();

enableIfOptin();

browser.runtime.onMessage.addListener((message, sender) => {
  if (DEBUG) { console.log("got message from popup", message, sender); }
  browser.storage.local.set(message).then(() => {
    enableIfOptin();
  });
});

function enableIfOptin() {
  browser.storage.local.get(["optin", "optin_incognito"], function(result) {
    if (DEBUG) { console.log("enableIfOptin", result); }
    optin_incognito = result.optin_incognito;
    if (result.optin) {
      enable();
    } else {
      browser.tabs.create({ url: "opt-in.html" });
    }
  });
}

function enable() {
  if (DEBUG) { console.log("enabling"); }
  browser.tabs.onCreated.addListener(onTabCreated);
  browser.tabs.onRemoved.addListener(onTabRemoved);
  browser.webNavigation.onCreatedNavigationTarget.addListener(onCreatedNavigationTarget);
  browser.webNavigation.onCommitted.addListener(_logNavigation);
  browser.webNavigation.onHistoryStateUpdated.addListener(_logNavigation);
  browser.webNavigation.onReferenceFragmentUpdated.addListener(_logNavigation);
  browser.webNavigation.onDOMContentLoaded.addListener(onDOMContentLoaded);
  connect();
}

function connect() {
  if (DEBUG) {
    port = {
      postMessage: (x) => {
        console.log(x);
      }
    };
  } else {
    port = browser.runtime.connectNative('navigation_log');
    port.onDisconnect.addListener(p => {
      started = false;
      setTimeout(() => {
        connect();
      }, 1000);
    });
  }

  browser.tabs.query({}).then(tabs => {
    var now = (new Date()).getTime();
    port.postMessage([now, 'start'])
    for (let tab of tabs) {
      urlFromTab[tab.id] = tab.url;
      if (!tab.incognito || optin_incognito) {
        allowedTabs.add(tab.id);
        port.postMessage([now, 'tab_init', undefined, tab.id, undefined, tab.url, tab.title, {incognito: tab.incognito}])
      }
    }
    started = true;
  });
}

function onTabCreated(tab) {
  if (started) {
    if (!tab.incognito || optin_incognito) {
      allowedTabs.add(tab.id);
      port.postMessage([(new Date()).getTime(), 'tab_create', undefined, tab.id, undefined, tab.url, tab.title, {incognito: tab.incognito}]);
    }
  }
}

function onTabRemoved(tabId) {
  if (started) {
    allowedTabs.delete(tabId);
    port.postMessage([(new Date()).getTime(), 'tab_remove', undefined, tabId]);
  }
}

function onCreatedNavigationTarget(evt) {
  if (DEBUG) { console.log("onCreatedNavigationTarget", evt); }
  if (!started || !allowedTabs.has(evt.tabId)) {
    return;
  }
  urlFromTab[evt.tabId] = urlFromTab[evt.sourceTabId];
  sourceTabId[evt.tabId] = evt.sourceTabId;
}

function logNavigation(evt, tab) {
  if (!allowedTabs.has(evt.tabId)) {
    return;
  }
  var srcUrl = urlFromTab[evt.tabId];
  var srcTabId = sourceTabId[evt.tabId];
  urlFromTab[evt.tabId] = evt.url;
  var value = [evt.timeStamp, 'nav', srcTabId, evt.tabId, srcUrl, evt.url, tab.title, extra[evt.tabId]];
  port.postMessage(value);
  delete sourceTabId[evt.tabId];
  delete extra[evt.tabId];
}

function _logNavigation(evt) {
  if (DEBUG) { console.log("_logNavigation", evt); }
  if (!started || evt.frameId !== 0 || !allowedTabs.has(evt.tabId)) {
    return;
  }
  extra[evt.tabId] = [evt.transitionType, evt.transitionQualifiers];
  browser.tabs.get(evt.tabId).then(tab => {
    if (tab.status == 'complete') {
      logNavigation(evt, tab);
    }
  });
}

function onDOMContentLoaded(evt) {
  if (DEBUG) { console.log("onDOMContentLoaded", evt); }
  if (!started || evt.frameId !== 0 || !allowedTabs.has(evt.tabId)) {
    return;
  }
  browser.tabs.get(evt.tabId).then(tab => {
    logNavigation(evt, tab);
  });
}
