function initClustermaps() {
	// Track whether the page is unloading. Firefox tears down the EventSource
	// while navigating away and dispatches an `error` event during unload.
	// Without this guard the error handler below calls window.location.reload(),
	// which cancels the navigation and snaps the user back to the clustermap
	// (and makes external links like CONTRIBUTE appear to "just refresh").
	let isUnloading = false;
	const markUnloading = function() { isUnloading = true; };
	window.addEventListener('pagehide', markUnloading);
	window.addEventListener('beforeunload', markUnloading);

	// Open a Server Side Events stream for all live locations
	const eventSource = new EventSource('/clustermap/locations/live');
	// Listen for new locations
	eventSource.addEventListener('update', function(event) {
		const data = JSON.parse(event.data);
		// Update the clustermap with the new locations
		updateClustermap(data);
	});
	eventSource.addEventListener('error', function(event) {
		// Don't react while navigating away, and let EventSource handle its own
		// automatic reconnection (readyState CONNECTING). Only reload when the
		// connection has permanently failed (readyState CLOSED).
		if (isUnloading || eventSource.readyState !== EventSource.CLOSED) {
			return;
		}
		console.error('EventSource failed:', event);
		window.location.reload();
	});
	eventSource.addEventListener('open', function(event) {
		console.log('EventSource opened');
	});
	eventSource.addEventListener('close', function(event) {
		if (isUnloading) {
			return;
		}
		console.warn('EventSource closed:', event);
		window.location.reload();
	});

	// Check for anchor link in the URL
	if (window.location.hash) {
		const hostToFocus = window.location.hash.substring(1);
		console.log("Focusing on host", hostToFocus);
		setTimeout(() => {
			focusHostHash(hostToFocus);
		}, 200);
	}

	// Add hash change event listener
	window.addEventListener('hashchange', function() {
		const hostToFocus = window.location.hash.substring(1);
		console.log("Hash changed, now focusing on host", hostToFocus);
		focusHostHash(hostToFocus);
	});
}
