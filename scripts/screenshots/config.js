// What the screenshots show: the device to emulate, and where in Lisbon each
// map scene takes place. The scenes are pinned to real stations (by serial
// number, which is stable) and real places, so the mock data baked by
// fetch-mock-data.js keeps matching them.

/** iPhone 13/14 logical size — 1170x2532 native, what the app stores expect. */
export const DEVICE = {
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 3,
	isMobile: true,
	hasTouch: true,
};

export const SCENES = {
	/** A busy station on Avenida da Liberdade, with no other station close
	  * enough for their markers to overlap, tapped from a couple of minutes'
	  * walk away so the sheet shows a distance. */
	station: {
		stationSerial: '1000305',
		position: { lat: 38.72278, lng: -9.14500 },
	},
	/** Campo Grande down to the bullring at Campo Pequeno: a short trip, and
	  * still one where taking a bike beats walking, which downtown only happens
	  * over distances too long to frame well. Both ends are a walk away from a
	  * station, and the one at the far end is past the station rather than
	  * behind it, so neither walking leg disappears under a marker. It runs
	  * north to south, which is how the app's fit to the route fills a phone
	  * screen best. */
	route: {
		position: { lat: 38.7515, lng: -9.1450 },
		destinationQuery: 'Praça de Touros',
	},
	/** Riding out of Entrecampos up the Campo Grande cycleway towards the park
	  * in Lumiar, a few minutes in: the traveled path comes from the bike route
	  * baked into the mock data, and the rest of it is computed live once the
	  * destination is set. */
	trip: {
		start: { lat: 38.74877, lng: -9.14872 },
		destinationQuery: 'Quinta das Conchas',
		/** How far along the baked path the rider currently is — a kilometer in,
		  * where the cycleway runs between the two halves of the Campo Grande
		  * gardens. */
		traveledFraction: 0.34,
		/** The fixes are dated back from now so the HUD shows this pace. */
		averageSpeedKmh: 14,
	},
};