<script lang="ts">
	interface Props {
		value: number|string;
		unit?: string;
		label: string;
		color?: string;
	}

	let {
		value,
		unit = '',
		label,
		color = 'primary',
	}: Props = $props();
</script>

<div class="flex flex-col items-center">
	<div>
		<span class="text-2xl font-bold text-{color} pr-px">{value.toLocaleString(undefined, { maximumFractionDigits: 2, useGrouping: false })}</span><span class="text-sm font-semibold text-label">
			{unit}
		</span>
	</div>
	<span class="text-2xs font-semibold text-label text-center -mt-1 leading-none max-w-[70px]">{label.toUpperCase()}</span>
</div>