const dateTimeSelector = document.getElementById('history-datetime-selector');

let oldLocationData = [];

function fetchLocationsAtDateTime() {
	if (initLoad) {
		clearTimeout(initLoad);
		initLoad = null;
	}
	const dateTime = dateTimeSelector.value;
	const req = fetch(`/clustermap/locations/${dateTime}`);
	req.then(res => res.json()).then(data => {
		const updatedLocations = filterUpdatedLocations(oldLocationData, data);
		console.log("Fetched location data", data, updatedLocations);
		oldLocationData = data;
		for (const removedLocation of updatedLocations["removed"]) {
			removeLocation(removedLocation);
		}
		for (const newLocation of updatedLocations["added"]) {
			console.log("Adding location", newLocation);
			createLocation(newLocation);
		}
	});
}

dateTimeSelector.addEventListener('change', fetchLocationsAtDateTime);
let initLoad = setTimeout(fetchLocationsAtDateTime, 200);
