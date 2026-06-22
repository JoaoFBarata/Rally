<script lang="ts">
    // TODO: Add linear scaling for marker size based on map zoom level
    const { profile_url, sport, n_confirmed_attendees, max_occupancy, marker_scale = 0.6 } = $props();
</script>
<div id="marker" class="w-[calc(var(--marker-scale)*8vw)]" style="--marker-scale: {marker_scale}">
    <div id="marker-icon-wrapper" class="relative w-full h-[calc(var(--marker-scale)*8vw)]">
        <div id="marker-icon" class="w-full h-full">
            <div id="outer-marker-icon" class="w-full h-full border-[calc(var(--marker-scale)*4px)] border-solid border-[#00B4D8FF] rounded-full">
                <img class="h-full w-full rounded-full p-[calc(var(--marker-scale)*0.19rem)]" id="inner-marker-icon" src={profile_url} alt="">
            </div>
        </div>
        <div id="marker-stats-wrapper">
            <div id="marker-occupation-wrapper" class="absolute bottom-0 left-0 w-[calc(var(--marker-scale)*2.58vw)] h-[calc(var(--marker-scale)*2.58vw)] rounded-full border-[calc(var(--marker-scale)*3px)] border-solid border-[#ff595eFF] bg-[#fdfdfdFF] flex flex-row items-center justify-between">
                <div class="flex items-center justify-center w-[50%] h-full">
                    <h3 class="ml-[calc(var(--marker-scale)*0.12vw)] mb-[calc(var(--marker-scale)*0.8vh)] text-[calc(var(--marker-scale)*0.7rem)] text-black font-bold">{n_confirmed_attendees}</h3>
                </div>
                <div class="absolute top-[-calc(var(--marker-scale)*2px)] right-[-calc(var(--marker-scale)*3.2px)] w-full h-[calc(var(--marker-scale)*2.55vw)] flex justify-center items-center">
                    <h3 class="absolute text-white font-bold text-[calc(var(--marker-scale)*0.7rem)] mt-[calc(var(--marker-scale)*0.8vh)] ml-[calc(var(--marker-scale)*0.3vw)]">{max_occupancy}</h3>
                    <svg class="w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="983.115 653.223 26.885 35.777" style="-webkit-print-color-adjust::exact" xmlns:xlink="http://www.w3.org/1999/xlink" fill="none" version="1.1">
                        <g id="shape-0acc1649-b424-80f6-8008-2c18c5851849">
                            <defs></defs>
                            <g class="fills" id="fills-0acc1649-b424-80f6-8008-2c18c5851849">
                                <path d="M998.1232299804688,653.2227783203125C1005.0663452148438,655.88916015625,1010,662.6229248046875,1010,670.5C1010,680.71044921875,1001.71044921875,689,991.5,689C988.4822998046875,689,985.63232421875,688.27587890625,983.1146240234375,686.9921264648438L998.1232299804688,653.2227783203125" style="fill:#00B4D8;fill-opacity:1"></path>
                            </g>
                        </g>
                    </svg>
                </div>
            </div>
            <div id="marker-sport-wrapper" class="absolute bottom-0 right-0 w-[calc(var(--marker-scale)*3.13vw)] h-[calc(var(--marker-scale)*3.13vw)] rounded-full border-[calc(var(--marker-scale)*3px)] border-solid border-[#0065fdFF] bg-[#fdfdfdFF] flex justify-center items-center">
                <img src="{sport}_icon.png" alt="" class="p-[calc(var(--marker-scale)*0.45vw)]">
            </div>
        </div>
    </div>
    <div id="marker-pin-wrapper" class="w-full flex flex-col items-center justify-center">
        <div id="marker-pin-connector" class="h-[calc(var(--marker-scale)*2.84vh)] w-[0.01px] border-[calc(var(--marker-scale)*2px)] border-solid border-[#0065fdFF] z-1 rounded-b-[calc(var(--marker-scale)*4px)]"></div>
        <div id="marker-pin" class="w-[calc(var(--marker-scale)*1.19vw)] h-[calc(var(--marker-scale)*1.19vw)] mt-[-calc(var(--marker-scale)*0.65vw)] rounded-full bg-[#fdfdfdFF] border-[calc(var(--marker-scale)*3px)] border-solid border-[#0065fdFF]"></div>
    </div>
</div>