<script lang="ts">
    // TODO: Add linear scaling for marker size based on map zoom level
    const { profile_url, sport, n_confirmed_attendees, max_occupancy, marker_scale = 0.6 } = $props();
</script>
<div id="marker" class="w-[calc(var(--marker-scale)*8vw)]" style="--marker-scale: {marker_scale}">
    <div id="marker-icon-wrapper" class="relative w-full h-[calc(var(--marker-scale)*8vw)]">
        <div id="marker-icon" class="w-full h-full">
            <div id="outer-marker-icon" class="w-full h-full border-[calc(var(--marker-scale)*7px)] border-solid border-[#00B4D8FF] rounded-full">
                <img class="h-full w-full rounded-full p-[calc(var(--marker-scale)*0.21vw)]" id="inner-marker-icon" src={profile_url} alt="">
            </div>
        </div>
        <div id="marker-stats-wrapper">
            <div id="marker-occupation-wrapper" class="absolute bottom-0 left-0 w-[calc(var(--marker-scale)*2.58vw)] h-[calc(var(--marker-scale)*2.58vw)] rounded-full p-[calc(var(--marker-scale)*5px)] bg-linear-115 from-[#ff595eFF] from-50% to-[#00B4D8FF] to-50%">
                <div class="w-full h-full bg-linear-115 from-[#fdfdfdFF] from-50% to-[#00B4D8FF] to-50% flex flex-row items-center justify-between px-[calc(var(--marker-scale)*0.2vw)] rounded-full">
                    <div class="mb-[calc(var(--marker-scale)*0.6vh)]">
                        <h3 class="text-[calc(var(--marker-scale)*1.3rem)] text-black font-bold">{n_confirmed_attendees}</h3>
                    </div>
                    <div class="mt-[calc(var(--marker-scale)*1.7vh)]">
                        <h3 class="text-white font-bold text-[calc(var(--marker-scale)*1.3rem)]">{max_occupancy}</h3>
                    </div>
                </div>
            </div>
            <div id="marker-sport-wrapper" class="absolute bottom-0 right-0 w-[calc(var(--marker-scale)*3.13vw)] h-[calc(var(--marker-scale)*3.13vw)] rounded-full border-[calc(var(--marker-scale)*7px)] border-solid border-[#0065fdFF] bg-[#fdfdfdFF] flex justify-center items-center">
                <img src="{sport}_icon.png" alt="" class="p-[calc(var(--marker-scale)*0.45vw)]">
            </div>
        </div>
    </div>
    <div id="marker-pin-wrapper" class="w-full flex flex-col items-center justify-center">
        <div id="marker-pin-connector" class="h-[calc(var(--marker-scale)*2.84vh)] w-[0.01px] mb-[calc(var(--marker-scale)*-1.3vh)] border-[calc(var(--marker-scale)*4px)] border-solid border-[#0065fdFF] z-1 rounded-b-[calc(var(--marker-scale)*4px)]"></div>
        <div id="marker-pin" class="w-[calc(var(--marker-scale)*1.19vw)] h-[calc(var(--marker-scale)*1.19vw)] mt-[-calc(var(--marker-scale)*0.65vw)] rounded-full bg-[#fdfdfdFF] border-[calc(var(--marker-scale)*5px)] border-solid border-[#0065fdFF]"></div>
    </div>
</div>