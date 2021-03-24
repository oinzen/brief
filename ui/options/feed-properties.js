import {Database} from "/modules/database.js";
import {apply_i18n} from "/modules/i18n.js";
import {Prefs} from "/modules/prefs.js";
import {Comm, wait} from "/modules/utils.js";
import {PrefBinder, Enabler} from "./options-common.js";


async function init() {
    apply_i18n(document);

    let feedID = (new URLSearchParams(document.location.search)).get('feedID');
    await Prefs.init();
    await Database.init();
    let feed = Database.getFeed(feedID);

    PrefBinder.init({
        getter: name => {
            switch(name) {
                case 'update-enabled':
                    return (feed.updateInterval > 0);
                case 'expire-enabled':
                    return (feed.entryAgeLimit > 0);
                case 'updateInterval':
                    feed._updateInterval = (feed.updateInterval ||
                                            Prefs.get('update.interval') * 1000);
                    return feed._updateInterval;
                case 'entryAgeLimit':
                    feed._entryAgeLimit = (feed.entryAgeLimit ||
                                            Prefs.get('database.entryExpirationAge'));
                    return feed._entryAgeLimit;
                default: return feed[name];
            }
        },
        setter: (name, value) => {
            switch(name) {
                case 'update-enabled':
                    name = 'updateInterval';
                    if(value) {
                        value = feed._updateInterval;
                    } else {
                        value = 0;
                    }
                    break;
                case 'expire-enabled':
                    name = 'entryAgeLimit';
                    if(value) {
                        value = feed._entryAgeLimit;
                    } else {
                        value = 0;
                    }
                    break;
                // 'updateInterval' and 'entryAgeLimit' can't be modified while not active
            }
            feed[name] = value;
            Database.modifyFeed({
                feedID: feed.feedID,
                [name]: value
            });
        },
    });

    let scaleMenu = document.getElementById('update-time-menulist');

    scaleMenu.addEventListener('change', () => updateScale());

    Comm.registerObservers({
        'feedlist-updated': async () => {
            await wait();
            let newFeed = Database.getFeed(feedID);
            if(newFeed === undefined) {
                window.close();
                return;
            }
            //TODO: maybe update the fields?
        },
        'is-options-window-open': async () => true,
    });

    setFeed(feed);

    let allFeeds = Database.feeds.filter(f => !f.hidden && !f.isFolder);
    let index = allFeeds.map(f => f.feedID).indexOf(feedID);
    let nextButton = /** @type {HTMLButtonElement} */(document.getElementById('next-feed'));
    nextButton.disabled = (index == allFeeds.length - 1);
    nextButton.addEventListener('click', () => {
        document.location.search = `?feedID=${allFeeds[index+1].feedID}`;
    });
    let prevButton = /** @type {HTMLButtonElement} */(document.getElementById('previous-feed'));
    prevButton.disabled = (index == 0);
    prevButton.addEventListener('click', () => {
        document.location.search = `?feedID=${allFeeds[index-1].feedID}`;
    });
    window.addEventListener(
        'beforeunload',
        () => Database.expireEntries(),
        {once: true, passive: true}
    );

    Enabler.init();

    // Workaround for mozilla bug 1408446 (Firefox before 62 / non-OOP) and size correctly
    let {id, height, width} = await browser.windows.getCurrent();
    let html = document.documentElement;
    console.log(html.scrollHeight, html.offsetHeight);
    await browser.windows.update(id, {
        height: height + html.scrollHeight - window.innerHeight,
        width: width + html.scrollWidth - window.innerWidth,
    });
}

function updateScale() {
    let scaleMenu = /** @type {HTMLSelectElement} */ (document.getElementById('update-time-menulist'));
    let interval = document.getElementById('updateInterval');
    let scale = 1;
    switch (scaleMenu.selectedIndex) {
        case 2: scale *= 24; // days to hours and fallthrough
        case 1: scale *= 60; // hours to minutes and fallthrough
        case 0:
            scale *= 60; // minutes to seconds and
            scale *= 1000; // seconds to milliseconds
    }
    PrefBinder.updateScale(interval, scale);
}

function setFeed(feed) {
    document.title = browser.i18n.getMessage('feedSettingsDialogTitle', feed.title);

    PrefBinder.refresh();

    // Guess interval scale
    let interval = document.getElementById('updateInterval');
    let scaleMenu = /** @type {HTMLSelectElement} */ (document.getElementById('update-time-menulist'));
    let value = PrefBinder.getValue(interval);
    let asDays = value / (1000*60*60*24);
    let asHours = value / (1000*60*60);

    // Select the largest scale that has an exact value
    switch (true) {
        case Math.ceil(asDays) == asDays:
            scaleMenu.selectedIndex = 2;
            break;
        case Math.ceil(asHours) == asHours:
            scaleMenu.selectedIndex = 1;
            break;
        default:
            scaleMenu.selectedIndex = 0;
            break;
    }
    updateScale();
}


window.addEventListener('load', () => init(), {once: true, passive: true});
