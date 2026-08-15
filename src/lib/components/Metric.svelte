<script lang="ts">
	interface Props {
		value: number|string;
		unit?: string;
		// optional second pair, for compound values like 1h26min
		secondValue?: number|string;
		secondUnit?: string;
		label: string;
		color?: string;
	}

	let {
		value,
		unit = '',
		secondValue = undefined,
		secondUnit = '',
		label,
		color = 'primary',
	}: Props = $props();
</script>

<div class="flex flex-col items-center">
	<div>
		<span class="text-2xl font-bold text-{color} pr-px">{value.toLocaleString(undefined, { maximumFractionDigits: 2, useGrouping: false })}</span><span class="text-sm font-semibold text-label">
			{unit}
		</span>{#if secondValue !== undefined}<span class="text-2xl font-bold text-{color} pr-px">{secondValue.toLocaleString(undefined, { maximumFractionDigits: 2, useGrouping: false })}</span><span class="text-sm font-semibold text-label">
			{secondUnit}
		</span>{/if}
	</div>
	<span class="text-2xs font-semibold text-label text-center -mt-1 leading-none max-w-[70px]">{label.toUpperCase()}</span>
</div>