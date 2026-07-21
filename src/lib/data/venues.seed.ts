import type { Sport } from '$lib/schema';

// Seed data for the Locations directory: real, researched Lisbon-area sports
// venues. `verificationStatus` starts 'unverified' for all of them — Rally
// has not partnered with or confirmed any of these directly, we're simply
// cataloguing real public venues so users know where an activity is
// possible. `officialNote`/`officialRating` are Rally's own short editorial
// assessment (not a scraped or fabricated "review" attributed to an
// individual) — the venue's "Rally users" review bucket starts empty and
// fills in naturally as real people play there.
export interface VenueSeed {
	name: string;
	sports: Sport[];
	description: string;
	address: string;
	city: string;
	lat: number;
	lng: number;
	website?: string;
	officialNote: string;
	officialRating: number;
}

export const venueSeeds: VenueSeed[] = [
	{
		name: 'UrbanSoccer Lisboa',
		sports: ['football'],
		description: 'Dedicated 5-a-side football centre in Monsanto Forest Park with six pitches, two of them covered.',
		address: 'Parque Florestal de Monsanto',
		city: 'Lisboa',
		lat: 38.7369,
		lng: -9.1962,
		website: 'https://www.urbansoccer.pt/',
		officialNote: 'A purpose-built 5-a-side hub with modern changing rooms and both covered and outdoor pitches — reliable for evening games year-round.',
		officialRating: 4
	},
	{
		name: 'PlaySports Arena Parque das Nações',
		sports: ['football'],
		description: 'Two artificially-lit 5-a-side pitches by the riverside in Parque das Nações.',
		address: 'Alameda dos Oceanos, Parque das Nações',
		city: 'Lisboa',
		lat: 38.769372,
		lng: -9.095788,
		officialNote: 'Good lighting and easy parking make this a solid pick for evening 5-a-side games near the river.',
		officialRating: 4
	},
	{
		name: 'Indoor Padel Center',
		sports: ['padel'],
		description: 'Indoor padel courts in Carnaxide, just outside central Lisbon.',
		address: 'Rua Fernando Távora, Carnaxide',
		city: 'Carnaxide',
		lat: 38.718076,
		lng: -9.222898,
		officialNote: 'Indoor courts mean games go ahead regardless of weather — a practical option for regular padel groups.',
		officialRating: 4
	},
	{
		name: 'Lisboa Racket Centre',
		sports: ['tennis', 'padel'],
		description: 'Long-running racket-sports club offering tennis, padel and squash near central Lisbon.',
		address: 'Lisboa',
		city: 'Lisboa',
		lat: 38.758911,
		lng: -9.136895,
		website: 'https://www.lrc.pt/en/',
		officialNote: 'One of Lisbon\'s oldest dedicated racket clubs — was the first in Portugal to add padel courts.',
		officialRating: 4
	},
	{
		name: 'Clube de Ténis do Estoril',
		sports: ['tennis'],
		description: 'Historic tennis club in Estoril with 18 courts, host of the Millennium Estoril Open.',
		address: 'Avenida Conde de Barcelona, Estoril',
		city: 'Estoril',
		lat: 38.716632,
		lng: -9.388393,
		officialNote: 'A genuine tour-level venue — same club that hosts the Millennium Estoril Open each year.',
		officialRating: 5
	},
	{
		name: 'Parque das Nações Riverside Courts',
		sports: ['basketball'],
		description: 'Colourful outdoor 3x3 basketball courts along the Parque das Nações riverside promenade.',
		address: 'Alameda dos Oceanos, Parque das Nações',
		city: 'Lisboa',
		lat: 38.769372,
		lng: -9.0965,
		officialNote: 'Popular pickup-game spot with a river breeze and skyline views — expect company most evenings.',
		officialRating: 4
	},
	{
		name: 'Estádio Universitário de Lisboa',
		sports: ['basketball', 'running', 'swimming', 'rugby'],
		description: 'Large multi-sport university complex with an athletics track, pools, courts and rugby pitches (home of CDUL Rugby).',
		address: 'Avenida Professor Egas Moniz',
		city: 'Lisboa',
		lat: 38.750116,
		lng: -9.164211,
		officialNote: 'One of the most complete multi-sport facilities in the city — day passes are available even if you\'re not a student.',
		officialRating: 4
	},
	{
		name: 'Parque das Nações Riverside Promenade',
		sports: ['running', 'cycling'],
		description: 'Flat, scenic riverside path along the Tagus, popular for running and cycling.',
		address: 'Avenida Dom João II, Parque das Nações',
		city: 'Lisboa',
		lat: 38.773516,
		lng: -9.097506,
		officialNote: 'Flat, well-lit, and scenic — one of the easiest places in Lisbon for a stress-free run or ride.',
		officialRating: 5
	},
	{
		name: 'Solinca Light Saldanha',
		sports: ['gym'],
		description: 'Central gym offering crosstraining, functional training, indoor cycling, pilates and yoga.',
		address: 'Centro Comercial Residence, Saldanha',
		city: 'Lisboa',
		lat: 38.734099,
		lng: -9.145009,
		officialNote: 'Central location and a wide class timetable make this an easy add for a weekday workout.',
		officialRating: 4
	},
	{
		name: 'Tonus Gym',
		sports: ['gym'],
		description: 'Neighbourhood fitness gym in Campo de Ourique.',
		address: 'Rua Tomás da Anunciação 68, Campo de Ourique',
		city: 'Lisboa',
		lat: 38.718909,
		lng: -9.16552,
		officialNote: 'A straightforward, no-frills neighbourhood gym — good if you just want to lift without the extras.',
		officialRating: 4
	},
	{
		name: 'Matchbox CrossFit',
		sports: ['gym'],
		description: 'CrossFit box in the Avenidas Novas area.',
		address: 'Avenidas Novas',
		city: 'Lisboa',
		lat: 38.7369,
		lng: -9.1499,
		officialNote: 'Community-driven CrossFit box with coached group classes — good for structured, high-intensity training.',
		officialRating: 4
	},
	{
		name: 'Bowling City',
		sports: ['bowling'],
		description: 'Two-floor bowling centre inside Centro Colombo shopping mall.',
		address: 'Avenida Lusíada, Centro Colombo',
		city: 'Lisboa',
		lat: 38.751995,
		lng: -9.189444,
		website: 'https://bowling-city.pt/',
		officialNote: 'Biggest bowling setup in the city, tucked inside Colombo mall — easy to combine with a night out.',
		officialRating: 4
	},
	{
		name: 'Snooker Club Lisboa',
		sports: ['snooker'],
		description: 'Restaurant and billiards club with snooker, pool and Portuguese pool tables on Avenida da Liberdade.',
		address: 'Travessa do Salitre 1',
		city: 'Lisboa',
		lat: 38.71848,
		lng: -9.145668,
		website: 'https://snookerclub.pt/en',
		officialNote: 'A proper snooker room just off Avenida da Liberdade, with a bar attached for the rest of the night.',
		officialRating: 4
	},
	{
		name: 'Lisboa Sports Club',
		sports: ['golf'],
		description: 'Long-established golf course in Belas, on the outskirts of Lisbon.',
		address: 'Casal da Carregueira, Belas',
		city: 'Belas',
		lat: 38.786486,
		lng: -9.25998,
		officialNote: 'One of the oldest clubs in the region — a classic, tree-lined parkland course.',
		officialRating: 4
	},
	{
		name: 'Oitavos Dunes',
		sports: ['golf'],
		description: 'Links-style golf course on the coast near Cascais, regularly ranked among Portugal\'s best.',
		address: 'Rua do Refúgio, Quinta da Marinha, Cascais',
		city: 'Cascais',
		lat: 38.698804,
		lng: -9.463766,
		officialNote: 'Consistently rated one of the top courses in Portugal — dune landscape right by the Atlantic.',
		officialRating: 5
	},
	{
		name: 'Piscina Municipal do Oriente',
		sports: ['swimming'],
		description: 'Municipal swimming pool in Parque das Nações.',
		address: 'Rua Câmara Reis, Parque das Nações',
		city: 'Lisboa',
		lat: 38.772332,
		lng: -9.100513,
		officialNote: 'A reliable municipal pool with a full weekday and weekend schedule.',
		officialRating: 4
	},
	{
		name: 'Piscina Municipal de Campo de Ourique',
		sports: ['swimming'],
		description: 'Municipal swimming pool serving the Campo de Ourique neighbourhood.',
		address: 'Rua Correia Teles 103, Campo de Ourique',
		city: 'Lisboa',
		lat: 38.719082,
		lng: -9.170329,
		officialNote: 'Neighbourhood pool with early opening hours, good for a swim before work.',
		officialRating: 4
	},
	{
		name: 'Parque Florestal de Monsanto',
		sports: ['hiking'],
		description: "Lisbon's largest green space, with wooded trails, viewpoints and mixed terrain for hiking and trail running.",
		address: 'Monsanto',
		city: 'Lisboa',
		lat: 38.7369,
		lng: -9.198,
		officialNote: 'The biggest stretch of green in the city — genuinely feels remote despite being minutes from downtown.',
		officialRating: 5
	},
	{
		name: 'Serra de Sintra / Parque da Pena',
		sports: ['hiking'],
		description: 'Forested mountain trails around Sintra\'s palaces, part of the Sintra-Cascais Natural Park.',
		address: 'Parque da Pena, Sintra',
		city: 'Sintra',
		lat: 38.794503,
		lng: -9.392211,
		officialNote: 'Dramatic scenery and real elevation gain — one of the best day-hike areas within reach of Lisbon.',
		officialRating: 5
	},
	{
		name: 'The Kynd Space',
		sports: ['yoga'],
		description: 'Boutique studio in Arroios offering yoga, pilates, barre and fitness classes.',
		address: 'Rua Cidade de Manchester 42, Arroios',
		city: 'Lisboa',
		lat: 38.727769,
		lng: -9.132759,
		officialNote: 'Small, well-run studio with a calm space — good for a focused yoga session.',
		officialRating: 4
	},
	{
		name: 'Connection Studio & Cafe',
		sports: ['yoga'],
		description: 'Studio and cafe near Santos offering yoga, dance, pilates and barre classes.',
		address: 'Rua da Bempostinha 64',
		city: 'Lisboa',
		lat: 38.722866,
		lng: -9.137256,
		officialNote: 'Studio-plus-cafe setup makes it easy to turn a class into a proper morning out.',
		officialRating: 4
	},
	{
		name: 'Carcavelos Surf School',
		sports: ['surf'],
		description: 'One of the longest-running surf schools on Carcavelos beach, teaching since 2001.',
		address: 'Avenida Marginal, Praia de Carcavelos',
		city: 'Carcavelos',
		lat: 38.677324,
		lng: -9.327926,
		website: 'https://carcavelossurfschool.com/',
		officialNote: 'Consistent, beginner-friendly beach break and one of the most established schools in the area.',
		officialRating: 4
	},
	{
		name: 'Câmara Lisboa Clube',
		sports: ['pingpong'],
		description: 'Competitive table tennis club based in Lisbon.',
		address: 'Avenida do Brasil 155',
		city: 'Lisboa',
		lat: 38.759786,
		lng: -9.137192,
		officialNote: 'A serious table tennis club with a competitive edge, not just a casual pastime.',
		officialRating: 4
	},
	{
		name: 'Estádio Francisco Lázaro (Fófó)',
		sports: ['americanfootball'],
		description: 'Home ground of the Lisboa Devils, current champions of the Portuguese American Football League.',
		address: 'Rua Olivério Serpa, Santa Cruz de Benfica',
		city: 'Lisboa',
		lat: 38.750258,
		lng: -9.205503,
		officialNote: 'Home turf of the reigning LPFA champions — a real, active American football scene in the city.',
		officialRating: 4
	},
	{
		name: 'Costa da Caparica Beach',
		sports: ['volleyball', 'surf'],
		description: 'Long stretch of Atlantic beach south of Lisbon with informal beach volleyball games and surf spots.',
		address: 'Praia de Costa da Caparica',
		city: 'Costa da Caparica',
		lat: 38.652408,
		lng: -9.235313,
		officialNote: 'Casual pickup volleyball is common along the beach in summer, alongside a solid stretch of surf breaks.',
		officialRating: 4
	},
	{
		name: 'StudioRise',
		sports: ['cycling'],
		description: 'Indoor cycling studio in Campo de Ourique.',
		address: 'Rua Correia Teles 18, Campo de Ourique',
		city: 'Lisboa',
		lat: 38.719082,
		lng: -9.1706,
		officialNote: 'High-energy indoor cycling classes — a good option when you want structure over an open ride.',
		officialRating: 4
	},
	{
		name: 'Amplify - Marquês',
		sports: ['gym', 'cycling'],
		description: 'Boutique studio near Marquês de Pombal offering bootcamp and indoor cycling classes.',
		address: 'Rua Mouzinho da Silveira 27, Avenidas Novas',
		city: 'Lisboa',
		lat: 38.722967,
		lng: -9.150765,
		officialNote: 'Central location right by Marquês de Pombal, easy to fit a class around a work day.',
		officialRating: 4
	}
];
