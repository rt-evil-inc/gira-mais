import { appSettings } from './settings';
import { derived, get } from 'svelte/store';

type Locale = 'en' | 'pt';

export function getLocale() {
	const settings = get(appSettings);
	const locale = settings.locale === 'system' ? navigator.language.split('-')[0] : settings.locale;
	return (['en', 'pt'].includes(locale) ? locale : 'en') as Locale;
}

export const t = derived(appSettings, () => {
	return <K extends keyof typeof translations>(key: K | undefined, params: Record<string, string> = {}): string => {
		const locale = getLocale();
		if (!key) {
			return '';
		}
		const template = translations[key]?.[locale];

		if (!template) {
			console.warn(`Translation not found for key: ${key} in locale: ${locale}`);
			return translations[key]?.en ?? key; // Fallback to English if not found
		}

		return template.replace(/{{(.*?)}}/g, (_, param) => {
			return params[param.trim()] ?? '';
		});
	};
});

const translations = {
	ok_button: {
		en: 'Ok',
		pt: 'Ok',
	},
	ignore_button: {
		en: 'Ignore this version',
		pt: 'Ignorar esta versão',
	},
	new_version_available: {
		en: 'New version available!',
		pt: 'Nova versão disponível!',
	},
	see_release_notes: {
		en: 'See release notes',
		pt: 'Veja as novidades',
	},
	update_warning_setting_note: {
		en: 'You can disable this warning in the settings.',
		pt: 'Pode desativar este aviso nas configurações.',
	},
	distance_traveled: {
		en: 'Distance Traveled',
		pt: 'Distância Percorrida',
	},
	average_speed: {
		en: 'Average Speed',
		pt: 'Velocidade Média',
	},
	distance_left: {
		en: 'Distance Left',
		pt: 'Distância em Falta',
	},
	time_left: {
		en: 'Time Left',
		pt: 'Tempo em Falta',
	},
	arrival_time: {
		en: 'Arrival Time',
		pt: 'Hora de Chegada',
	},
	rate_trip_error: {
		en: 'Error rating trip',
		pt: 'Erro ao avaliar viagem',
	},
	last_trip_question: {
		en: 'How was your last trip?',
		pt: 'Como foi a sua última viagem?',
	},
	station_label: {
		en: 'Station',
		pt: 'Estação',
	},
	bikes_label: {
		en: 'BIKES',
		pt: 'BICICLETAS',
	},
	free_docks_label: {
		en: 'FREE\nDOCKS',
		pt: 'DOCAS\nLIVRES',
	},
	duration_label: {
		en: 'DURATION',
		pt: 'DURAÇÃO',
	},
	hours_label: {
		en: 'h',
		pt: 'h',
	},
	minutes_label: {
		en: 'min',
		pt: 'min',
	},
	trips_label: {
		en: 'Trips',
		pt: 'Viagens',
	},
	no_trips_label: {
		en: 'No trips',
		pt: 'Nenhuma viagem',
	},
	no_trips_registered_label: {
		en: 'No trips registered',
		pt: 'Não há viagens registadas',
	},
	about_label: {
		en: 'About',
		pt: 'Sobre',
	},
	app_description: {
		en: 'This application is a re-implementation of the Gira app\'s functionalities.',
		pt: 'Esta aplicação é uma re-implementação das funcionalidades da aplicação Gira.',
	},
	not_official_disclaimer: {
		en: 'The application is unofficial and not affiliated in any way with EMEL or Câmara Municipal de Lisboa.',
		pt: 'A aplicação não é oficial, não estando afiliada de modo algum à EMEL ou à Câmara Municipal de Lisboa.',
	},
	find_out_more_at: {
		en: 'Find out more at ',
		pt: 'Saiba mais em ',
	},
	made_by: {
		en: 'Made by',
		pt: 'Desenvolvido por',
	},
	open_source_license: {
		en: 'Open-source project under the GPL-3.0 license',
		pt: 'Projeto open-source sob a licença GPL-3.0',
	},
	user_label: {
		en: 'User',
		pt: 'Utilizador',
	},
	balance_label: {
		en: 'Balance',
		pt: 'Saldo',
	},
	points_label: {
		en: 'Points',
		pt: 'Pontos',
	},
	no_subscription_label: {
		en: 'No subscription',
		pt: 'Sem subscrição',
	},
	annual_pass_label: {
		en: 'Annual Pass',
		pt: 'Passe Anual',
	},
	monthly_pass_label: {
		en: 'Monthly Pass',
		pt: 'Passe Mensal',
	},
	daily_pass_label: {
		en: 'Daily Pass',
		pt: 'Passe Diário',
	},
	valid_until_label: {
		en: 'Valid until {{date}}',
		pt: 'Válido até {{date}}',
	},
	history_label: {
		en: 'History',
		pt: 'Histórico',
	},
	settings_label: {
		en: 'Settings',
		pt: 'Configurações',
	},
	feedback_label: {
		en: 'Feedback',
		pt: 'Feedback',
	},
	contribute_label: {
		en: 'Contribute',
		pt: 'Contribuir',
	},
	star_label: {
		en: 'Leave a star',
		pt: 'Deixar uma estrela',
	},
	exit_label: {
		en: 'LOGOUT',
		pt: 'SAIR',
	},
	welcome_message: {
		en: 'Welcome to Gira+',
		pt: 'Bem-vindo à Gira+',
	},
	email_label: {
		en: 'Email',
		pt: 'Email',
	},
	email_placeholder: {
		en: 'example@example.com',
		pt: 'exemplo@exemplo.com',
	},
	password_label: {
		en: 'Password',
		pt: 'Password',
	},
	invalid_credentials_error: {
		en: 'Invalid credentials',
		pt: 'Credenciais inválidas',
	},
	unknown_error: {
		en: 'Unknown error',
		pt: 'Erro desconhecido',
	},
	login_button: {
		en: 'Login',
		pt: 'Login',
	},
	login_disclaimer: {
		en: 'This application is not official and is not affiliated with EMEL. Your credentials are not shared with us or any third party.',
		pt: 'Esta aplicação não é oficial e não está afiliada à EMEL. As suas credenciais não são partilhadas connosco ou com terceiros.',
	},
	history_subtext: {
		en: 'List of previous trips',
		pt: 'Lista de viagens anteriores',
	},
	settings_subtext: {
		en: 'Application settings',
		pt: 'Definições da aplicação',
	},
	feedback_subtext: {
		en: 'Problems and suggestions',
		pt: 'Problemas e sugestões',
	},
	about_subtext: {
		en: 'Information about the application',
		pt: 'Informação acerca da aplicação',
	},
	contribute_subtext: {
		en: 'Support the project\'s development',
		pt: 'Apoiar o desenvolvimento do projeto',
	},
	star_subtext: {
		en: 'Leave us a star on GitHub',
		pt: 'Deixa-nos uma estrela no GitHub',
	},
	dock_label: {
		en: 'DOCK',
		pt: 'DOCA',
	},
	theme_setting_label: {
		en: 'Theme',
		pt: 'Tema',
	},
	theme_setting_description: {
		en: 'Application color scheme',
		pt: 'Esquema de cores da aplicação',
	},
	system_theme: {
		en: 'System',
		pt: 'Sistema',
	},
	light_theme: {
		en: 'Light',
		pt: 'Claro',
	},
	dark_theme: {
		en: 'Dark',
		pt: 'Escuro',
	},
	daylight_theme: {
		en: 'Daylight',
		pt: 'Luz do dia',
	},
	locale_setting_label: {
		en: 'Language',
		pt: 'Idioma',
	},
	locale_setting_description: {
		en: 'Application language',
		pt: 'Idioma da aplicação',
	},
	system_locale: {
		en: 'System',
		pt: 'Sistema',
	},
	lock_distance_setting_label: {
		en: 'Limit unlocking',
		pt: 'Limitar desbloqueio',
	},
	lock_distance_setting_description: {
		en: 'Restrict bicycle unlocking distance to {{distance}} meters',
		pt: 'Restringir a distância de desbloqueio de bicicletas a {{distance}} metros',
	},
	background_location_setting_label: {
		en: 'Background location',
		pt: 'Localização em segundo plano',
	},
	background_location_setting_description: {
		en: 'Continue updating the location while the device is locked or the app is in the background',
		pt: 'Continuar a atualizar a localização enquanto o dispositivo está bloqueado ou a aplicação está em segundo plano',
	},
	analytics_setting_label: {
		en: 'Contribute to statistics',
		pt: 'Contribuir para estatísticas',
	},
	analytics_setting_description: {
		en: 'Contribute with the collection of anonymous events: app opening, trip starts and errors',
		pt: 'Contribuir com a coleção de eventos anónimos: abertura da aplicação, começo de viagens e erros',
	},
	mock_unlock_setting_label: {
		en: 'Simulate unlocking',
		pt: 'Simular desbloqueio',
	},
	mock_unlock_setting_description: {
		en: 'Simulate reservation and unlocking of bicycles in development mode',
		pt: 'Simular a reserva e desbloqueio de bicicletas em modo de desenvolvimento',
	},
	report_ratings_setting_label: {
		en: 'Share trip ratings',
		pt: 'Partilhar avaliações de viagens',
	},
	report_ratings_setting_description: {
		en: 'Share your trip ratings with us so we can warn about bike conditions',
		pt: 'Partilhar as suas avaliações de viagens connosco para que possamos avisar sobre o estado das bicicletas',
	},
	ui_settings_section: {
		en: 'Interface',
		pt: 'Interface',
	},
	location_settings_section: {
		en: 'Location',
		pt: 'Localização',
	},
	warnings_settings_section: {
		en: 'Warnings',
		pt: 'Avisos',
	},
	statistics_settings_section: {
		en: 'Statistics',
		pt: 'Estatísticas',
	},
	development_settings_section: {
		en: 'Development',
		pt: 'Desenvolvimento',
	},
	no_tokens_available_error: {
		en: 'No tokens available',
		pt: 'Sem tokens disponíveis',
	},
	token_encryption_error: {
		en: 'Error encrypting the token',
		pt: 'Erro ao encriptar o token',
	},
	token_fetch_error: {
		en: 'Error obtaining a token',
		pt: 'Erro ao obter um token',
	},
	auth_api_communication_error: {
		en: 'Could not communicate with the authentication API. The service may be temporarily unavailable.',
		pt: 'Não foi possível comunicar com a API de autenticação da Gira. O serviço pode estar temporariamente indisponível.',
	},
	gira_api_communication_error: {
		en: 'Could not communicate with the Gira service API. The service may be temporarily unavailable.',
		pt: 'Não foi possível comunicar com a API do serviço Gira. O serviço pode estar temporariamente indisponível.',
	},
	auth_api_communication_error_retry: {
		en: 'Could not communicate with the authentication API. Retrying...',
		pt: 'Não foi possível comunicar com a API de autenticação da Gira. A tentar novamente...',
	},
	gira_api_communication_error_retry: {
		en: 'Could not communicate with the Gira service API. Retrying...',
		pt: 'Não foi possível comunicar com a API do serviço Gira. A tentar novamente...',
	},
	no_active_subscription_error: {
		en: 'You don\'t have an active subscription',
		pt: 'Não tem uma subscrição ativa',
	},
	negative_balance_error: {
		en: 'It\'s not possible to unlock bicycles if your balance is negative',
		pt: 'Não é possível desbloquear bicicletas se o seu saldo for negativo',
	},
	location_determination_error: {
		en: 'It was not possible to determine your position',
		pt: 'Não foi possível determinar a sua posição',
	},
	not_close_enough_error: {
		en: 'You\'re not close enough to the station',
		pt: 'Não está perto o suficiente da estação',
	},
	bike_unlock_error: {
		en: 'It was not possible to unlock the bicycle',
		pt: 'Não foi possível desbloquear a bicicleta',
	},
	bike_unlock_no_serial_error: {
		en: 'Bike identification number not found',
		pt: 'Numero de identificação da bicicleta não encontrado',
	},
	service_hours_error: {
		en: 'Service unavailable. Hours of operation between 06:00 and 02:00.',
		pt: 'Serviço indisponível. Horário de utilização entre as 06:00 e as 02:00.',
	},
	trip_interval_limit_error: {
		en: 'You have to wait 5 minutes between trips',
		pt: 'Tem que esperar 5 minutos entre viagens',
	},
	already_active_trip_error: {
		en: 'You already have an active trip',
		pt: 'Já tem uma viagem ativa',
	},
	trip_not_found_error: {
		en: 'Trip not found',
		pt: 'Viagem não encontrada',
	},
	bike_already_in_trip_error: {
		en: 'This bike is already in a trip',
		pt: 'Esta bicicleta já está numa viagem',
	},
	bike_already_reserved_error: {
		en: 'This bike is already reserved',
		pt: 'Esta bicicleta já está reservada',
	},
	no_bike_found_error: {
		en: 'No bike found',
		pt: 'Não foi possível encontrar a bicicleta',
	},
	bike_in_repair_error: {
		en: 'This bike is in repair',
		pt: 'Esta bicicleta está em reparação',
	},
	network_offline_warning: {
		en: 'You are currently offline',
		pt: 'Não está ligado à Internet',
	},
	update_warning_setting_label: {
		en: 'Update warning',
		pt: 'Aviso de atualização',
	},
	update_warning_setting_description: {
		en: 'Show a warning when a new version of the app is available',
		pt: 'Mostrar um aviso quando uma nova versão da aplicação estiver disponível',
	},
	no_bikes_found: {
		en: 'No bikes found',
		pt: 'Nenhuma bicicleta encontrada',
	},
	search_other_bikes: {
		en: 'Add missing bike',
		pt: 'Adicionar bicicleta em falta',
	},
	ghost_bike_title: {
		en: 'Missing bikes',
		pt: 'Bicicletas em falta',
	},
	ghost_bike_description: {
		en: 'You can try to retrieve bikes that do not appear in the system through their number.',
		pt: 'Pode tentar retirar bicicletas que não aparecem no sistema através do seu número.',
	},
	ghost_dismiss_label: {
		en: 'Add missing bike',
		pt: 'Adicionar bicicleta em falta',
	},
	bike_unlock_invalid_id_error: {
		en: 'Invalid bike ID. It should be a 4-digit number.',
		pt: 'ID de bicicleta inválido. Deve ser um número de 4 dígitos.',
	},
} as const;

export type Translations = typeof translations;