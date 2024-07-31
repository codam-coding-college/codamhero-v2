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
