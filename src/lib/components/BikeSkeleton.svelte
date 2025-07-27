<div class="flex items-center justify-center w-full min-h-[70px] relative overflow-hidden rounded-2xl" style:box-shadow="0px 0px 12px 0px var(--color-shadow)" >
	<div class="absolute flex items-center bg-background rounded-2xl h-full w-full px-5 gap-5 dark:bg-background-secondary" style:box-shadow="0px 0px 12px 0px var(--color-shadow)" >
		<div class="w-[36px] h-[36px] -ml-2 -mr-2 bg-background-tertiary animate-pulse rounded-lg"></div>
		<span class="h-6 font-semibold bg-background-tertiary rounded-lg w-16 animate-pulse"></span>
		<div class="grow"></div>
		{#if Math.random() < 0.5}
			<div class="flex items-center h-6 px-[6px] animate-pulse rounded-md gap-1 w-16 bg-background-tertiary">
			</div>
		{/if}
		<div class="flex flex-col items-center text-primary w-6 h-8 bg-background-tertiary animate-pulse rounded-lg">
		</div>
	</div>
</div>