<script lang="ts">
	import { fly } from 'svelte/transition';
	import { safeInsets } from '$lib/ui';
	import IconWifiOff from '@tabler/icons-svelte/icons/wifi-off';
	import { t } from '$lib/translations';

	export let tripStatusHeight: number = 0;
	export let tripStatusWidth: number = 0;
</script>

<div
	transition:fly={{ y: -120 }}
	class="absolute left-1/2 flex flex-col items-center justify-center p-2 gap-1 bg-background rounded-2xl z-50"
	style:box-shadow="0px 0px 20px 0px var(--color-shadow)"
	style:top="{Math.max(tripStatusHeight + 16, $safeInsets.top + 8)}px"
	style:transform="translateX(calc(-50% + {tripStatusWidth / 2}px))"
>
	<div class="flex items-center justify-center gap-2 p-2">
		<IconWifiOff size={24} stroke={1.7} class="text-info" />
		<span class="font-bold text-info text-sm mx-1 whitespace-nowrap">
			{$t('network_offline_warning')}
		</span>
	</div>
</div>