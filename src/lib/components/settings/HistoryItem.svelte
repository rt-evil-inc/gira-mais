<script lang="ts">
	import type { TripHistory_TripDetail } from '$lib/gira-api/api-types';
	import { t } from '$lib/translations';

	interface Props {
		trip: TripHistory_TripDetail|null;
	}

	let { trip }: Props = $props();

	function getMinutesDiff(date1:Date, date2:Date) {
		const diff = Math.abs(date2.getTime() - date1.getTime());
		return Math.floor((diff / 1000) / 60) % 60;
	}
	function getHoursDiff(date1:Date, date2:Date) {
		const diff = Math.abs(date2.getTime() - date1.getTime());
		return Math.floor((diff / 1000) / 60 / 60);
	}
	function formatHours(date:Date) {
		const hour = date.getHours().toString().padStart(2, '0');
		const minute = date.getMinutes().toString().padStart(2, '0');
		return `${hour}:${minute}`;
	}

	function idFromName(name:string) {
		return name.split(/-|–/).map(t => t.trim())[0];
	}

	function nameFromName(name:string) {
		return name.split(/-|–/).map(t => t.trim())[1];
	}
</script>

{#if trip != null}
	<div class="flex bg-background rounded-2xl py-4 px-6 gap-5 text-info justify-between dark:bg-background-secondary" style:box-shadow="0px 0px 12px 0px var(--color-shadow)">
		<div class="flex flex-col items-center justify-center gap-[6px]">
			<div class="rounded-full border-[3px] w-4 h-4 border-primary shrink-0"></div>
			<div class="bg-primary w-[3px] h-2 rounded-full"></div>
			<div class="bg-primary w-[3px] h-2 rounded-full"></div>
			<div class="bg-primary w-[3px] h-2 rounded-full"></div>
			<svg class="shrink-0" width="13.6" height="18.4" viewBox="0 0 34 46" fill="none" xmlns="http://www.w3.org/2000/svg">
				<circle cx="17" cy="17" r="17" class="fill-primary"/>
				<path d="M17.5 46L4.00002 28L30 28L17.5 46Z" class="fill-primary"/>
			</svg>
		</div>
		<div class="flex flex-col gap-4 grow">
			<div>
				<div class="font-bold text-primary text-xl leading-none">{formatHours(new Date(trip.startDate))}</div>
				{#if trip.startLocation}
					<div class="font-bold text-xs">{$t('station_label')} {idFromName(trip.startLocation)}</div>
					<div class="font-medium leading-none text-xs text-label">{nameFromName(trip.startLocation)}</div>
				{/if}
			</div>
			<div>
				<div class="font-bold text-primary text-xl leading-none">{formatHours(new Date(trip.endDate))}</div>
				{#if trip.endLocation}
					<div class="font-bold text-xs">{$t('station_label')} {idFromName(trip.endLocation)}</div>
					<div class="font-medium leading-none text-xs text-label">{nameFromName(trip.endLocation)}</div>
				{/if}
			</div>
		</div>
		<div class="flex flex-col items-center justify-center gap-5 justify-self-end">
			<div class="flex flex-col">
				<div class="flex flex-col items-center">
					<div class="text-nowrap">
						{#if getHoursDiff(new Date(trip.endDate), new Date(trip.startDate)) > 0}
							<span class="text-2xl font-bold text-primary pr-px">{getHoursDiff(new Date(trip.endDate), new Date(trip.startDate))}</span><span class="text-sm font-semibold text-label">{$t('hours_label')}</span>
						{/if}
						<span class="text-2xl font-bold text-primary pr-px">{getMinutesDiff(new Date(trip.endDate), new Date(trip.startDate))}</span><span class="text-sm font-semibold text-label">{$t('minutes_label')}</span>
					</div>
					<span class="text-2xs font-semibold text-label text-center -mt-1 leading-none max-w-[70px]">{$t('duration_label')}</span>
				</div>
				<!-- <Metric value={formatDateDiffMinutes(new Date(trip.endDate), new Date(trip.startDate))} unit="min" label="Duração" /> -->

			</div>
			<div class="flex flex-col items-center">
				<svg class="w-9 h-6" width="101" height="62" viewBox="0 0 101 62" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M17.6281 43.8324L30.1299 34.3483C25.5527 28.2782 15.9614 30.0396 11.8001 30.8144C21.0715 32.5001 17.6281 43.8324 17.6281 43.8324Z" class="fill-primary"/>
					<path d="M17.6281 43.8324L33.8172 44.108C33.254 39.8784 31.906 36.7038 30.1299 34.3483L17.6281 43.8324Z" class="fill-primary"/>
					<path d="M45.8091 44.3121L38.494 28.0031M45.8091 44.3121L69.1334 16.9106M45.8091 44.3121L33.8172 44.108M31.9585 13.6128H26.8019M31.9585 13.6128H39.1536M31.9585 13.6128L38.494 28.0031M17.6281 43.8324C17.6281 43.8324 21.0715 32.5001 11.8001 30.8144M17.6281 43.8324L33.8172 44.108M17.6281 43.8324L30.1299 34.3483M38.494 28.0031L30.1299 34.3483M82.5043 43.8324L76.5084 36.2775L69.1334 16.9106M69.1334 16.9106L66.1953 8.15652L73.3305 3L61.3386 3.65955M69.1334 16.9106H75.8574M11.8001 30.8144C15.9614 30.0396 25.5527 28.2782 30.1299 34.3483M11.8001 30.8144H4.21436M33.8172 44.108C33.254 39.8784 31.906 36.7038 30.1299 34.3483" class="stroke-primary" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
					<circle cx="18.4076" cy="43.5921" r="15.4076" class="stroke-primary" stroke-width="6"/>
					<circle cx="82.4437" cy="43.5921" r="15.4076" class="stroke-primary" stroke-width="6"/>
				</svg>
				<div class="text-primary font-bold text-sm">{trip.bikeName}</div>
			</div>
		</div>
	</div>
{:else}
	<div class="bg-neutral-50 animate-pulse h-32 rounded-2xl py-4 px-6 gap-5 dark:bg-background-secondary" style:box-shadow="0px 0px 12px 0px var(--color-shadow)"></div>
{/if}