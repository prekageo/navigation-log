var urlFromTab = {};
var sourceTabId = {};
var extra = {};
var port;
var started = false;
var DEBUG = false;

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
      port.postMessage([now, 'tab_init', undefined, tab.id, undefined, tab.url, tab.title, {incognito: tab.incognito}])
    }
    started = true;
  });
}

browser.tabs.onCreated.addListener(tab => {
  if (started) {
    port.postMessage([(new Date()).getTime(), 'tab_create', undefined, tab.id, undefined, tab.url, tab.title, {incognito: tab.incognito}]);
  }
});

browser.tabs.onRemoved.addListener(tabId => {
  if (started) {
    port.postMessage([(new Date()).getTime(), 'tab_remove', undefined, tabId]);
  }
});

browser.webNavigation.onCreatedNavigationTarget.addListener(evt => {
  if (!started || evt.sourceFrameId !== 0) {
    return;
  }
  urlFromTab[evt.tabId] = urlFromTab[evt.sourceTabId];
  sourceTabId[evt.tabId] = evt.sourceTabId;
});

function logNavigation(evt, tab) {
  if (extra[evt.tabId] === undefined) {
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
  if (!started || evt.frameId !== 0) {
    return;
  }
  extra[evt.tabId] = [evt.transitionType, evt.transitionQualifiers];
  browser.tabs.get(evt.tabId).then(tab => {
    if (tab.status == 'complete') {
      logNavigation(evt, tab);
    }
  });
}

browser.webNavigation.onCommitted.addListener(_logNavigation);
browser.webNavigation.onHistoryStateUpdated.addListener(_logNavigation);
browser.webNavigation.onReferenceFragmentUpdated.addListener(_logNavigation);

browser.webNavigation.onDOMContentLoaded.addListener(evt => {
  if (!started || evt.frameId !== 0) {
    return;
  }
  browser.tabs.get(evt.tabId).then(tab => {
    logNavigation(evt, tab);
  });
});

connect();
