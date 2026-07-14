<script lang="ts">
    // TODO: Add linear scaling for marker size based on level
    const { profile_url, name_letter = 'U', sport, n_confirmed_attendees, max_occupancy, marker_scale = 0.6, marker_color = '#00B4D8FF', cluster_count = 0 } = $props();
</script>

<div id="marker" class="w-[calc(var(--marker-scale)*8*var(--base-vw))]" style="--base-vw: calc(var(--size-multiplier, 1)*1vw); --base-vh: calc(var(--size-multiplier, 1)*1vh); --marker-scale: calc({marker_scale}*var(--map-zoom-scale)); --marker-color: {marker_color}">
    <div id="marker-icon-wrapper" class="relative w-full h-[calc(var(--marker-scale)*8*var(--base-vw))]">
        <div id="marker-icon" class="w-full h-full">
            <div id="outer-marker-icon" class="w-full h-full border-[calc(var(--marker-scale)*7px)] border-solid border-(--marker-color) rounded-full bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden">
                {#if profile_url}
                    <img class="h-full w-full rounded-full p-[calc(var(--marker-scale)*0.21*var(--base-vw))] object-cover" id="inner-marker-icon" src={profile_url} alt="">
                {:else}
                    <span class="text-slate-700 dark:text-slate-350 font-black text-[calc(var(--marker-scale)*3.2*var(--base-vw))] select-none">
                        {name_letter}
                    </span>
                {/if}
            </div>
        </div>
        <div id="marker-stats-wrapper">
            {#if cluster_count > 0}
                <div id="marker-cluster-badge" class="absolute top-[calc(var(--marker-scale)*-0.8*var(--base-vw))] right-[calc(var(--marker-scale)*-1.6*var(--base-vw))] select-none text-slate-500 dark:text-slate-400 font-extrabold text-[calc(var(--marker-scale)*2rem)] drop-shadow-sm">
                    +{cluster_count}
                </div>
            {:else}
                <div id="marker-occupation-wrapper" class="absolute bottom-0 left-0 w-[calc(var(--marker-scale)*2.58*var(--base-vw))] h-[calc(var(--marker-scale)*2.58*var(--base-vw))] rounded-full p-[calc(var(--marker-scale)*5px)] bg-linear-115 from-[#ff595eFF] from-50% to-[#00B4D8FF] to-50%">
                    <div class="w-full h-full bg-linear-115 from-[#fdfdfdFF] from-50% to-[#00B4D8FF] to-50% dark:from-[#1e293b] flex flex-row items-center justify-between px-[calc(var(--marker-scale)*0.2*var(--base-vw))] rounded-full">
                        <div class="mb-[calc(var(--marker-scale)*0.6*var(--base-vh))]">
                            <h3 class="text-[calc(var(--marker-scale)*1.3rem)] text-black dark:text-white font-bold">{n_confirmed_attendees}</h3>
                        </div>
                        <div class="mt-[calc(var(--marker-scale)*1.7*var(--base-vh))]">
                            <h3 class="text-white font-bold text-[calc(var(--marker-scale)*1.3rem)]">{max_occupancy}</h3>
                        </div>
                    </div>
                </div>
                <div id="marker-sport-wrapper" class="absolute bottom-0 right-0 w-[calc(var(--marker-scale)*3.13*var(--base-vw))] h-[calc(var(--marker-scale)*3.13*var(--base-vw))] rounded-full border-[calc(var(--marker-scale)*7px)] border-solid border-[#0065fdFF] bg-[#fdfdfdFF] dark:bg-slate-800 flex justify-center items-center">
                    <img src="{sport}_icon.png" alt="" class="p-[calc(var(--marker-scale)*0.45*var(--base-vw))]">
                </div>
            {/if}
        </div>
    </div>
    <div id="marker-pin-wrapper" class="w-full flex flex-col items-center justify-center">
        <div id="marker-pin-connector" class="h-[calc(var(--marker-scale)*2.84*var(--base-vh))] w-[0.01px] mb-[calc(var(--marker-scale)*-1.3*var(--base-vh))] border-[calc(var(--marker-scale)*4px)] border-solid border-[#0065fdFF] z-1 rounded-b-[calc(var(--marker-scale)*4px)]"></div>
        <div id="marker-pin" class="w-[calc(var(--marker-scale)*1.19*var(--base-vw))] h-[calc(var(--marker-scale)*1.19*var(--base-vw))] mt-[-calc(var(--marker-scale)*0.65*var(--base-vw))] rounded-full bg-[#fdfdfdFF] dark:bg-slate-800 border-[calc(var(--marker-scale)*5px)] border-solid border-[#0065fdFF]"></div>
    </div>
</div>

<style>
    #marker {
        --size-multiplier: 1;
    }

    @media (max-width: 768px) {
        #marker {
            /* Scale all viewport elements up by 1.85x dynamically on mobile screens */
            --size-multiplier: 1.85;
        }
    }
</style>