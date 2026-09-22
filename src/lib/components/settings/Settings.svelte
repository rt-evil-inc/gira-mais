<script>
	import { dev } from '$app/environment';
	import { compassAccuracy, compassHeading, compassStatus } from '$lib/compass';
	import { LOCK_DISTANCE_m } from '$lib/constants';
	import { appSettings } from '$lib/settings';
	import MenuPage from '$lib/components/MenuPage.svelte';
	import SettingsRow from '$lib/components/settings/SettingsRow.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import { t } from '$lib/translations';
</script>

<MenuPage>
	<div class="flex flex-col p-5 gap-8 grow">
		<div class="text-3xl font-bold text-info pt-1">{$t('settings_label')}</div>

		<!-- UI Settings Section -->
		<div class="flex flex-col gap-4">
			<div class="text-lg font-semibold text-info px-2">{$t('ui_settings_section')}</div>
			<div class="flex flex-col gap-2">
				<SettingsRow label={$t('locale_setting_label')} description={$t('locale_setting_description')}>
					<select bind:value={$appSettings.locale} class="bg-background-secondary dark:bg-background-tertiary rounded-xl border-none focus:ring-0 text-sm">
						<option value="system">{$t('system_locale')}</option>
						<option value="en">English</option>
						<option value="pt">Português</option>
					</select>
				</SettingsRow>
				<SettingsRow label={$t('theme_setting_label')} description={$t('theme_setting_description')}>
					<select bind:value={$appSettings.theme} class="bg-background-secondary dark:bg-background-tertiary rounded-xl border-none focus:ring-0 text-sm">
						<option value="system">{$t('system_theme')}</option>
						<option value="daylight">{$t('daylight_theme')}</option>
						<option value="light">{$t('light_theme')}</option>
						<option value="dark">{$t('dark_theme')}</option>
					</select>
				</SettingsRow>
			</div>
		</div>

		<!-- Location Settings Section -->
		<div class="flex flex-col gap-4">
			<div class="text-lg font-semibold text-info px-2">{$t('location_settings_section')}</div>
			<div class="flex flex-col gap-2">
				<SettingsRow label={$t('lock_distance_setting_label')} description={$t('lock_distance_setting_description', { distance: LOCK_DISTANCE_m.toString() })}>
					<Toggle bind:checked={$appSettings.distanceLock} />
				</SettingsRow>
				<SettingsRow label={$t('background_location_setting_label')} description={$t('background_location_setting_description')}>
					<Toggle bind:checked={$appSettings.backgroundLocation} />
				</SettingsRow>
			</div>
		</div>

		<!-- Warnings Section -->
		<div class="flex flex-col gap-4">
			<div class="text-lg font-semibold text-info px-2">{$t('warnings_settings_section')}</div>
			<div class="flex flex-col gap-2">
				<SettingsRow label={$t('update_warning_setting_label')} description={$t('update_warning_setting_description')}>
					<Toggle bind:checked={$appSettings.updateWarning} />
				</SettingsRow>
			</div>
		</div>

		<!-- Statistics Section -->
		<div class="flex flex-col gap-4">
			<div class="text-lg font-semibold text-info px-2">{$t('statistics_settings_section')}</div>
			<div class="flex flex-col gap-2">
				<SettingsRow label={$t('analytics_setting_label')} description={$t('analytics_setting_description')}>
					<Toggle bind:checked={$appSettings.analytics} />
				</SettingsRow>
				<SettingsRow label={$t('report_ratings_setting_label')} description={$t('report_ratings_setting_description')}>
					<Toggle bind:checked={$appSettings.reportRatings} />
				</SettingsRow>
			</div>
		</div>

		{#if dev}
			<!-- Development Section -->
			<div class="flex flex-col gap-4">
				<div class="text-lg font-semibold text-info px-2">{$t('development_settings_section')}</div>
				<div class="flex flex-col gap-2">
					<SettingsRow label={$t('mock_unlock_setting_label')} description={$t('mock_unlock_setting_description')}>
						<Toggle bind:checked={$appSettings.mockUnlock} />
					</SettingsRow>
					<SettingsRow label={$t('marker_smoothing_setting_label')} description={$t('marker_smoothing_setting_description')}>
						<Toggle bind:checked={$appSettings.markerSmoothing} />
					</SettingsRow>
					<SettingsRow label={$t('compass_debug_label')} description={$t('compass_debug_description')}>
						<div class="text-sm font-medium text-right whitespace-nowrap">
							<div>{$compassStatus}</div>
							{#if $compassHeading !== null}
								<div>{Math.round($compassHeading)}°{$compassAccuracy !== null ? ` ± ${Math.round($compassAccuracy)}°` : ''}</div>
							{/if}
						</div>
					</SettingsRow>
				</div>
			</div>
		{/if}
	</div>
</MenuPage>