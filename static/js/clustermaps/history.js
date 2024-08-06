function initClustermaps() {
	const dateTimeSelector = document.getElementById('history-datetime-selector');

	let oldLocationData = [];
	const controller = new AbortController();
	const signal = controller.signal;

	function fetchLocationsAtDateTime() {
		if (initLoad) {
			clearTimeout(initLoad);
			initLoad = null;
		}
		const dateTime = dateTimeSelector.value;
		const req = fetch(`/clustermap/locations/${dateTime}`, { signal });
		req.then(res => res.json()).then(data => {
			const updatedLocations = filterUpdatedLocations(oldLocationData, data);
			console.log("Fetched location data", data, updatedLocations);
			oldLocationData = data;
			for (const removedLocation of updatedLocations["removed"]) {
				removeLocation(removedLocation);
			}
			for (const newLocation of updatedLocations["added"]) {
				createLocation(newLocation);
			}
		}).catch(err => {
			console.error("Failed to fetch location data", err);
		});
	}

	dateTimeSelector.addEventListener('change', fetchLocationsAtDateTime);
	let initLoad = setTimeout(fetchLocationsAtDateTime, 200);
}
