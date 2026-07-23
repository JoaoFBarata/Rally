import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'adc.fct.rally',
	appName: 'Rally',
	webDir: 'build',
	plugins: {
		StatusBar: {
			overlaysWebView: false,
			style: 'DEFAULT'
		},
		PushNotifications: {
			presentationOptions: ['badge', 'sound', 'alert']
		}
	}
};

export default config;
