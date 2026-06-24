<script lang="ts">
    // Custom responsive marker component with fixed base pixel sizes
    const { profile_url, sport, n_confirmed_attendees, max_occupancy, marker_scale = 0.6, marker_color = '#00B4D8FF' } = $props();
</script>
<div id="marker" class="w-[calc(var(--marker-scale)*100px)] origin-bottom transition-transform duration-75" style="--marker-scale: {marker_scale}; --marker-color: {marker_color}; transform: scale(var(--map-zoom-scale, 1));">
    <div id="marker-icon-wrapper" class="relative w-full h-[calc(var(--marker-scale)*100px)]">
        <div id="marker-icon" class="w-full h-full">
            <div id="outer-marker-icon" class="w-full h-full border-[calc(var(--marker-scale)*7px)] border-solid border-[var(--marker-color)] rounded-full">
                <img class="h-full w-full rounded-full p-[calc(var(--marker-scale)*3px)]" id="inner-marker-icon" src={profile_url} alt="">
            </div>
        </div>
        <div id="marker-stats-wrapper">
            <div id="marker-occupation-wrapper" class="absolute bottom-0 left-0 w-[calc(var(--marker-scale)*32px)] h-[calc(var(--marker-scale)*32px)] rounded-full p-[calc(var(--marker-scale)*5px)] bg-linear-115 from-[#ff595eFF] from-50% to-[var(--marker-color)] to-50%">
                <div class="w-full h-full bg-linear-115 from-[#fdfdfdFF] from-50% to-[var(--marker-color)] to-50% flex flex-row items-center justify-between px-[calc(var(--marker-scale)*2px)] rounded-full">
                    <div class="mb-[calc(var(--marker-scale)*4px)]">
                        <h3 class="text-[calc(var(--marker-scale)*1.3rem)] text-black font-bold">{n_confirmed_attendees}</h3>
                    </div>
                    <div class="mt-[calc(var(--marker-scale)*12px)]">
                        <h3 class="text-white font-bold text-[calc(var(--marker-scale)*1.3rem)]">{max_occupancy}</h3>
                    </div>
                </div>
            </div>
            <div id="marker-sport-wrapper" class="absolute bottom-0 right-0 w-[calc(var(--marker-scale)*40px)] h-[calc(var(--marker-scale)*40px)] rounded-full border-[calc(var(--marker-scale)*7px)] border-solid border-[var(--marker-color)] bg-[#fdfdfdFF] flex justify-center items-center">
                <img src="{sport}_icon.png" alt="" class="p-[calc(var(--marker-scale)*6px)]">
            </div>
        </div>
    </div>
    <div id="marker-pin-wrapper" class="w-full flex flex-col items-center justify-center">
        <div id="marker-pin-connector" class="h-[calc(var(--marker-scale)*22px)] w-[0.01px] mb-[calc(var(--marker-scale)*-10px)] border-[calc(var(--marker-scale)*4px)] border-solid border-[var(--marker-color)] z-1 rounded-b-[calc(var(--marker-scale)*4px)]"></div>
        <div id="marker-pin" class="w-[calc(var(--marker-scale)*15px)] h-[calc(var(--marker-scale)*15px)] mt-[calc(var(--marker-scale)*-8px)] rounded-full bg-[#fdfdfdFF] border-[calc(var(--marker-scale)*5px)] border-solid border-[var(--marker-color)]"></div>
    </div>
</div>