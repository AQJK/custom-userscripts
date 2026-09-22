// ==UserScript==
// @name            Auto PIP
// @author          AQJK
// @namespace       https://qaisarmedia.com
// @description     auto-pip when scrolling down on youtube
// @license         Creative Commons Attribution License
// @version	        0.1
// @include         http://www.example.org/*
// @released        2026-09-22
// @updated         2026-09-22
// @compatible      Greasemonkey
// ==/UserScript==

// ------------------------------------------------------------------
// Auto PiP
// ------------------------------------------------------------------

var AUTO_PIP_KEY = 'wblock.tubeCleaner.autoPiP';
var autoPiPEnabled = true;
var pipActive = false;

function getAutoPiP() {
    try {
        var stored = localStorage.getItem(AUTO_PIP_KEY);
        return stored === null ? true : stored === '1';
    } catch (e) { return true; }
}

function setAutoPiP(v) {
    storageSet(AUTO_PIP_KEY, v ? '1' : '0');
    autoPiPEnabled = v;
}

try { autoPiPEnabled = getAutoPiP(); } catch (e) { /* ignore */ }

function supportsWebkitPiP(video) {
    try {
        return !!(video && typeof video.webkitSupportsPresentationMode === 'function' &&
            video.webkitSupportsPresentationMode('picture-in-picture'));
    } catch (e) { return false; }
}

function isPiPActive(video) {
    return document.pictureInPictureElement === video ||
        (video && video.webkitPresentationMode === 'picture-in-picture');
}

function enterPiP(video) {
    if (!video || !autoPiPEnabled) return;
    if (isPiPActive(video)) return;
    if (video.paused || video.ended) return;
    try {
        if (supportsWebkitPiP(video) && typeof video.webkitSetPresentationMode === 'function') {
            // Track only PiP entered by Tube Cleaner. PiP entered manually
            // from Safari's controls must remain under the user's control.
            pipActive = true;
            video.webkitSetPresentationMode('picture-in-picture');
            log('PiP entered');
        } else if (typeof video.requestPictureInPicture === 'function') {
            pipActive = true;
            var request = video.requestPictureInPicture();
            if (request && request.catch) {
                request.catch(function (e) {
                    pipActive = false;
                    log('PiP request rejected', e);
                });
            }
            log('PiP entered via API');
        }
    } catch (e) {
        pipActive = false;
        warn('enterPiP failed', e);
    }
}

function exitPiP(video) {
    if (!video || !pipActive) return;
    if (!isPiPActive(video)) {
        pipActive = false;
        return;
    }
    try {
        if (supportsWebkitPiP(video) && typeof video.webkitSetPresentationMode === 'function') {
            video.webkitSetPresentationMode('inline');
            pipActive = false;
            log('PiP exited');
        } else if (document.pictureInPictureElement && typeof document.exitPictureInPicture === 'function') {
            var request = document.exitPictureInPicture();
            if (request && request.catch) {
                request.catch(function (e) { log('PiP exit rejected', e); });
            }
            pipActive = false;
        }
    } catch (e) { warn('exitPiP failed', e); }
}

function setupAutoPiP(video) {
    if (!video || video._wblockAutoPiPHooked) return;
    video._wblockAutoPiPHooked = true;

    // Tab switch: enter PiP when tab hides, exit when visible.
    // Note: enableBackgroundPlayback() overrides document.hidden to always
    // return false, so we use _realHidden which tracks the true state.
    function onVisibilityChange() {
        if (!autoPiPEnabled) return;
        if (_realHidden) {
            if (!video.paused && !video.ended) {
                enterPiP(video);
            }
        } else if (document.hasFocus() && isPiPActive(video)) {
            exitPiP(video);
        }
    }

    // Losing keyboard focus does not mean the video is obscured on macOS:
    // another visible window may simply be active beside Safari. Enter PiP
    // only for actual page hiding or when the video scrolls out of view.
    function onFocus() {
        if (!autoPiPEnabled) return;
        if (_realHidden) return;
        if (document.hasFocus() && isPiPActive(video)) {
            exitPiP(video);
        }
    }
    function onBlur() {
        // iPhone can suspend a video before its hidden event is delivered.
        // Enter while the page still owns an active playback gesture.
        if (IS_IPHONE && !video.paused && !video.ended) enterPiP(video);
    }

    var removeVisibilityObserver = observeRealVisibility(onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);

    // Scroll out of view: use IntersectionObserver.
    // On mobile YouTube the watch player is normally position:fixed (sticky).
    // Tube Cleaner overrides it to position:absolute so it scrolls with the
    // page. Without this guard the observer would enter PiP every time the
    // user scrolls past the video to read comments.
    var stickyContainer = document.getElementById('player-container-id');
    var skipScrollPiP = !!(stickyContainer && stickyContainer.classList.contains('sticky-player'));
    var scrollObserver = null;
    if (!skipScrollPiP) {
        scrollObserver = new IntersectionObserver(function (entries) {
            if (!autoPiPEnabled) return;
            entries.forEach(function (entry) {
                if (!entry.isIntersecting && !video.paused && !video.ended) {
                    enterPiP(video);
                } else if (entry.isIntersecting && isPiPActive(video)) {
                    exitPiP(video);
                }
            });
        }, { threshold: 0.1 });
        scrollObserver.observe(video);
    }

    // Listen for presentation mode changes
    function onPresentationModeChange() {
        if (video.webkitPresentationMode !== 'picture-in-picture') {
            pipActive = false;
        }
        log('presentation mode changed:', video.webkitPresentationMode);
    }
    function onLeavePictureInPicture() { pipActive = false; }
    video.addEventListener('webkitpresentationmodechanged', onPresentationModeChange);
    video.addEventListener('leavepictureinpicture', onLeavePictureInPicture);

    // Release all of the above when this video is superseded, so listeners
    // and observers do not accumulate across SPA navigations.
    registerCleanup(function () {
        removeVisibilityObserver();
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('blur', onBlur);
        try { if (scrollObserver) scrollObserver.disconnect(); } catch (e) { /* ignore */ }
        video.removeEventListener('webkitpresentationmodechanged', onPresentationModeChange);
        video.removeEventListener('leavepictureinpicture', onLeavePictureInPicture);
    });
}
