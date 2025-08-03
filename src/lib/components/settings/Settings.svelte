<script>
	import { dev } from '$app/environment';
	import { LOCK_DISTANCE_m } from '$lib/constants';
	import { appSettings } from '$lib/settings';
	import MenuPage from '$lib/components/MenuPage.svelte';
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
				<div class="flex bg-background rounded-2xl py-4 px-5 gap-5 text-info justify-between items-center dark:bg-background-secondary" style:box-shadow="0px 0px 12px 0px var(--color-shadow)">
					<div class="grow">
						<div class="font-semibold leading-tight mb-1">{$t('locale_setting_label')}</div>
						<div class="text-xs font-medium leading-[1.1] text-label">{$t('locale_setting_description')}</div>
					</div>
					<select bind:value={$appSettings.locale} class="bg-background-secondary dark:bg-background-tertiary rounded-xl border-none focus:ring-0 text-sm">
						<option value="system">{$t('system_locale')}</option>
						<option value="en">English</option>
						<option value="pt">Português</option>
					</select>
				</div>
				<div class="flex bg-background rounded-2xl py-4 px-5 gap-5 text-info justify-between items-center dark:bg-background-secondary" style:box-shadow="0px 0px 12px 0px var(--color-shadow)">
					<div class="grow">
						<div class="font-semibold leading-tight mb-1">{$t('theme_setting_label')}</div>
						<div class="text-xs font-medium leading-[1.1] text-label">{$t('theme_setting_description')}</div>
					</div>
					<select bind:value={$appSettings.theme} class="bg-background-secondary dark:bg-background-tertiary rounded-xl border-none focus:ring-0 text-sm">
						<option value="system">{$t('system_theme')}</option>
						<option value="daylight">{$t('daylight_theme')}</option>
						<option value="light">{$t('light_theme')}</option>
						<option value="dark">{$t('dark_theme')}</option>
					</select>
				</div>
			</div>
		</div>

		<!-- Location Settings Section -->
		<div class="flex flex-col gap-4">
			<div class="text-lg font-semibold text-info px-2">{$t('location_settings_section')}</div>
			<div class="flex flex-col gap-2">
				<div class="flex bg-background rounded-2xl py-4 px-5 gap-5 text-info justify-between items-center dark:bg-background-secondary" style:box-shadow="0px 0px 12px 0px var(--color-shadow)">
					<div class="grow">
						<div class="font-semibold leading-tight mb-1">{$t('lock_distance_setting_label')}</div>
						<div class="text-xs font-medium leading-[1.1] text-label">{$t('lock_distance_setting_description', { distance: LOCK_DISTANCE_m.toString() })}</div>
					</div>
					<Toggle bind:checked={$appSettings.distanceLock} />
				</div>
				<div class="flex bg-background rounded-2xl py-4 px-5 gap-5 text-info justify-between items-center dark:bg-background-secondary" style:box-shadow="0px 0px 12px 0px var(--color-shadow)">
					<div class="grow">
						<div class="font-semibold leading-tight mb-1">{$t('background_location_setting_label')}</div>
						<div class="text-xs font-medium leading-[1.1] text-label">{$t('background_location_setting_description')}</div>
					</div>
					<Toggle bind:checked={$appSettings.backgroundLocation} />
				</div>
			</div>
		</div>

		<!-- Warnings Section -->
		<div class="flex flex-col gap-4">
			<div class="text-lg font-semibold text-info px-2">{$t('warnings_settings_section')}</div>
			<div class="flex flex-col gap-2">
				<div class="flex bg-background rounded-2xl py-4 px-5 gap-5 text-info justify-between items-center dark:bg-background-secondary" style:box-shadow="0px 0px 12px 0px var(--color-shadow)">
					<div class="grow">
						<div class="font-semibold leading-tight mb-1">{$t('update_warning_setting_label')}</div>
						<div class="text-xs font-medium leading-[1.1] text-label">{$t('update_warning_setting_description')}</div>
					</div>
					<Toggle bind:checked={$appSettings.updateWarning} />
				</div>
			</div>
		</div>

		<!-- Statistics Section -->
		<div class="flex flex-col gap-4">
			<div class="text-lg font-semibold text-info px-2">{$t('statistics_settings_section')}</div>
			<div class="flex flex-col gap-2">
				<div class="flex bg-background rounded-2xl py-4 px-5 gap-5 text-info justify-between items-center dark:bg-background-secondary" style:box-shadow="0px 0px 12px 0px var(--color-shadow)">
					<div class="grow">
						<div class="font-semibold leading-tight mb-1">{$t('analytics_setting_label')}</div>
						<div class="text-xs font-medium leading-[1.1] text-label">{$t('analytics_setting_description')}</div>
					</div>
					<Toggle bind:checked={$appSettings.analytics} />
				</div>
				<div class="flex bg-background rounded-2xl py-4 px-5 gap-5 text-info justify-between items-center dark:bg-background-secondary" style:box-shadow="0px 0px 12px 0px var(--color-shadow)">
					<div class="grow">
						<div class="font-semibold leading-tight mb-1">{$t('report_ratings_setting_label')}</div>
						<div class="text-xs font-medium leading-[1.1] text-label">{$t('report_ratings_setting_description')}</div>
					</div>
					<Toggle bind:checked={$appSettings.reportRatings} />
				</div>
			</div>
		</div>

		{#if dev}
			<!-- Development Section -->
			<div class="flex flex-col gap-4">
				<div class="text-lg font-semibold text-info px-2">{$t('development_settings_section')}</div>
				<div class="flex flex-col gap-2">
					<div class="flex bg-background rounded-2xl py-4 px-5 gap-5 text-info justify-between items-center dark:bg-background-secondary" style:box-shadow="0px 0px 12px 0px var(--color-shadow)">
						<div class="grow">
							<div class="font-semibold leading-tight mb-1">{$t('mock_unlock_setting_label')}</div>
							<div class="text-xs font-medium leading-[1.1] text-label">{$t('mock_unlock_setting_description')}</div>
						</div>
						<Toggle bind:checked={$appSettings.mockUnlock} />
					</div>
				</div>
			</div>
		{/if}
	</div>
</MenuPage>