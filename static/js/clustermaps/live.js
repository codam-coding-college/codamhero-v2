// Open a Server Side Events stream for all live locations
const eventSource = new EventSource('/clustermap/locations/live');
// Listen for messages
eventSource.onmessage = function(event) {
	const data = JSON.parse(event.data);
	// Update the clustermap with the new locations
	updateClustermap(data);
};
eventSource.onerror = function(event) {
	console.error('EventSource failed:', event);
};

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
