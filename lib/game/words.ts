// Word pool. Hand-curated common English (no obscure or offensive words), split into
// difficulty tiers by length at load time, so adding words is just appending to a block.
export const TIERS = ['short', 'medium', 'long', 'xlong'] as const;
export type Tier = (typeof TIERS)[number];

const SPACE = `
  orb sun ion ray arc gas ice sky jet fog dust star moon void nova core beam rock dark glow hull fuel ring belt
  mars dune lens node rift warp zone axis bolt comet orbit meteor photon plasma zenith nebula quasar saturn lunar
  solar cosmic gravity vector signal beacon shield thrust engine galaxy radius helium carbon horizon jupiter kinetic
  magnet oxygen prism quartz rocket umbra xenon aurora eclipse radar sector uplink vortex asteroid satellite telescope
  starlight trajectory momentum spectrum celestial atmosphere magnitude parallax supernova meridian stardust moonlight
  navigator frequency resonance threshold monolith obsidian perimeter quadrant universe velocity outpost pendulum
  radiance sentinel twilight constellation interstellar gravitational observatory magnetosphere photosphere
  astronomical circumference equilibrium hemisphere luminescence perihelion synchronous thermosphere transmission
  acceleration counterweight illumination navigational propulsion reconnaissance stratosphere telemetry wavelength
  atmospheric spectroscopy astronaut cosmonaut spacecraft spaceship starship shuttle capsule module docking airlock
  thruster booster payload launchpad countdown liftoff splashdown reentry heatshield antenna receiver transmitter
  probe rover lander orbiter station habitat colony frontier explorer pioneer voyager mercury venus earth neptune
  uranus pluto titan europa callisto ganymede phobos deimos crater basalt regolith meteorite asteroids comets
  galaxies quasars pulsar pulsars blackhole wormhole singularity redshift blueshift doppler cosmos infinity eternity
  aphelion perigee apogee equinox solstice zodiac starfield starlit stellar planet planets planetary lunar solar
  orbital eclipse corona flare sunspot solarwind ionosphere exosphere mesosphere vacuum cosmic darkness horizon
  gamma alpha beta delta omega sigma lambda epsilon kappa theta proton neutron electron neutrino quark boson fusion
  fission reactor isotope radiation particle collider magnetic polarity charge voltage current circuit signal
  beacon distress mayday rescue salvage debris shrapnel fragment impact collision trajectory intercept evasive
  maneuver navigation coordinates bearing heading vector velocity momentum inertia gravity orbit escape drift
`;

const NATURE = `
  oak elm ash fir yew bay sea bog fen dew mud ash ivy moss fern reed rose lily iris sage mint pine palm teak
  leaf root seed stem bark bud twig vine weed lake pond pool reef cove bay cape glen dale vale hill peak cliff
  crag ridge slope gorge canyon valley meadow prairie tundra desert forest jungle swamp marsh delta island
  lagoon harbor shore coast beach dune glacier iceberg volcano geyser crater summit plateau boulder pebble
  stone gravel sand clay soil loam peat chalk flint marble granite slate quartz crystal amber pearl coral
  river stream creek brook spring waterfall rapids current ripple wave tide surf foam spray mist fog haze
  cloud storm thunder lightning rain drizzle shower downpour hail sleet snow blizzard frost dew breeze gale
  gust wind tornado hurricane cyclone typhoon monsoon drought flood rainbow sunrise sunset dawn dusk twilight
  midnight noon morning evening season spring summer autumn winter harvest blossom bloom petal pollen nectar
  orchard garden grove thicket hedge bramble thistle clover daisy tulip violet orchid lotus jasmine lavender
  sunflower dandelion bluebell poppy marigold magnolia willow maple birch cedar cypress redwood sequoia bamboo
  cactus mushroom lichen seaweed kelp plankton coral wildflower woodland rainforest wilderness landscape
  scenery horizon skyline waterfall riverbank seashore coastline mountain foothill highland lowland grassland
  wetland floodplain estuary peninsula archipelago continent ocean atlantic pacific arctic antarctic tropical
  temperate climate weather forecast humidity pressure temperature thermometer barometer evaporation
  condensation precipitation erosion sediment mineral fossil geology ecosystem habitat biodiversity
`;

const ANIMALS = `
  ant bee bat cat cow dog eel elk emu fox gnu hen jay owl pig ram rat yak ape bear boar bull calf colt crab
  crow deer dove duck fawn frog goat hare hawk lamb lark lion lynx mole moth mule newt puma seal slug swan
  toad wasp wolf worm wren zebra camel cobra eagle egret finch gecko goose heron horse hyena koala lemur llama
  macaw moose mouse otter panda quail raven rhino robin shark sheep skunk sloth snail snake squid stork swift
  tiger trout viper whale badger beaver bison cougar donkey falcon ferret gerbil gibbon gopher hornet iguana
  impala jaguar lizard magpie marten monkey ocelot oriole osprey parrot pigeon possum puffin python rabbit
  salmon toucan turkey turtle walrus weasel wombat alpaca beetle buffalo caribou catfish cheetah chicken
  dolphin gazelle giraffe gorilla hamster lobster mammoth meerkat narwhal octopus ostrich panther peacock
  pelican penguin piranha raccoon reindeer sardine scorpion seahorse sparrow spider squirrel starling
  stingray swallow tadpole termite tortoise vulture warthog wildcat albatross alligator anteater armadillo
  butterfly chameleon chimpanzee crocodile dragonfly elephant flamingo grasshopper hedgehog hippopotamus
  hummingbird jellyfish kangaroo ladybug leopard mosquito nightingale orangutan porcupine rattlesnake
  salamander woodpecker wolverine kingfisher lionfish mockingbird roadrunner barracuda bumblebee caterpillar
  centipede cockatoo firefly goldfish greyhound honeybee husky labrador mustang pheasant platypus poodle
  retriever sheepdog stallion terrier unicorn dragon phoenix griffin pegasus
`;

const FOOD = `
  egg ham jam pie tea fig nut pea yam bun cod oat rye corn bean beef bread cake chip clam corn curd date dill
  duck feta flan fish herb kale lamb leek lime meat milk mint miso naan okra pear plum pork rice roll sage salt
  soup soya stew taco tofu tuna veal wrap apple bacon bagel basil berry candy chili cocoa cream crepe curry
  donut flour fudge grape gravy guava honey jelly juice lemon mango maple melon mocha olive onion pasta peach
  pecan pizza prune ramen salad salsa sauce scone spice steak sugar sushi syrup toast tomato wafer almond
  banana barley brunch butter carrot cashew cereal cheese cherry cookie dinner fennel garlic ginger granola
  hazelnut lentil muffin mustard noodle nutmeg oatmeal omelet orange papaya parsley peanut pepper pickle
  potato pretzel pudding pumpkin quinoa radish raisin risotto saffron salami sesame shrimp spinach squash
  strudel sundae tahini turnip waffle walnut yogurt zucchini apricot avocado biscuit brownie burrito cabbage
  caramel celery chutney cinnamon coconut crouton cucumber custard dumpling eggplant espresso falafel
  lasagna lemonade macaroni marmalade meatball mushroom pancake pastry popcorn porridge ravioli sandwich
  sausage smoothie spaghetti tangerine teriyaki truffle vanilla vinegar watermelon blueberry breakfast
  broccoli buttermilk cappuccino cauliflower cheesecake chocolate cranberry croissant gingerbread grapefruit
  guacamole hamburger marshmallow mozzarella parmesan peppermint pineapple pistachio raspberry strawberry
  tortilla blackberry cornbread dragonfruit gooseberry pomegranate
`;

const HOME = `
  bed cup mug pan pot jar box bag key map pen ink cap hat mat rug tub fan lamp desk sofa sink door gate wall
  roof tile beam step yard shed barn loft attic porch stair chair table shelf couch stool bench clock frame
  mirror pillow blanket quilt sheet towel basket bucket candle carpet closet cradle curtain cushion drawer
  faucet fridge garage hammer handle kettle ladder locker mailbox napkin needle oven pantry plate plug rack
  saucer scissors shovel spoon fork knife bowl ladle tray vase whisk broom brush comb soap razor sponge wallet
  purse ribbon button zipper thread fabric cotton linen silk wool velvet denim leather jacket sweater shirt
  skirt dress trousers jeans shorts socks boots shoes sandals slippers scarf gloves mittens helmet umbrella
  backpack suitcase luggage keychain notebook pencil eraser crayon marker stapler envelope postcard calendar
  bookshelf cupboard dresser wardrobe armchair bathtub shower toaster blender kettle microwave dishwasher
  laundry doorbell doormat fireplace chimney hallway bedroom kitchen bathroom basement balcony courtyard
  driveway fence garden window curtain lantern flashlight battery charger cable remote speaker headphones
  keyboard monitor printer scanner camera tripod picture painting poster sculpture ornament trophy
  furniture appliance household neighbor apartment cottage mansion bungalow cabin castle palace tower
`;

const TECH = `
  app bit bug byte code chip data disk file font icon link loop mode node port ram rom sync tag web wifi zip
  array cache class click cloud debug email error event field frame graph image index input label layer
  login logic macro merge modem mouse otter parse pixel query queue radio reset route scale scope screen
  script shell slide stack table theme token touch tweet video virus widget access backup binary bitmap
  browser buffer button camera client column cursor domain driver editor export filter folder format
  gadget github hacker header import inbox kernel laptop layout legacy method mobile module object online
  output packet parser patch plugin pointer portal process profile program protocol python random record
  render report router runtime sandbox scroll search second sensor server socket source sprite status
  stream string switch symbol syntax system tablet target thread toggle update upload useful vector version
  window wizard account adapter address algorithm analog android archive backend battery bluetooth
  bookmark broadband calculator checkbox circuit clipboard compiler computer console container controller
  cookie database dataset debugger default desktop developer device digital directory display download
  dropdown emulator encrypt engineer firewall firmware frontend function gateway hardware hashtag
  homepage hyperlink interface internet iterate javascript keyboard language library license machine
  malware memory message metadata microchip microphone monitor network notebook notification offline
  operator optimize password payload platform playlist podcast preview printer processor projector
  register repository resolution robotics satellite scanner screenshot selector shortcut signature
  simulator smartphone snapshot software speaker spreadsheet storage streaming subscribe terminal
  touchscreen transistor username variable virtual voicemail webcam website wireless workflow
  automation bandwidth benchmark blockchain broadcast calibrate component compression connection
  cybersecurity deployment encryption ethernet framework generator hologram infrastructure
  installation integration kilobyte megabyte gigabyte terabyte microprocessor motherboard multimedia
  navigation pagination performance peripheral permission prototype quantum refactor semiconductor
  spacebar synchronize technology telephone television typewriter validation visualize
`;

const PEOPLE = `
  boy girl man son kid aunt baby band bard chef chief clan crew duke fan guru hero host king lord maid monk
  page poet pope sage team tribe uncle actor adult agent angel baker buyer cadet coach cousin diver donor
  drummer elder envoy guard guest judge knight mayor medic miner nanny niece nurse owner pilot queen ranger
  rider rival saint scout sister smith tutor uncle usher widow archer artist author banker barber bishop
  broker butler captain cashier citizen climber courier critic dancer dentist deputy doctor editor farmer
  father friend gardener golfer guitarist hunter inventor jockey jogger keeper lawyer leader mentor
  merchant mother musician narrator neighbor officer painter partner pianist planner player plumber poet
  prince princess producer professor publisher racer reader referee runner sailor scholar scientist
  sculptor senator singer skater soldier speaker student surgeon swimmer tailor teacher teammate tourist
  trainer traveler twin umpire veteran viewer visitor voter waiter warden warrior weaver winner worker
  writer ambassador architect astronomer athlete biologist carpenter champion chemist commander composer
  conductor detective diplomat director economist electrician emperor engineer entrepreneur explorer
  firefighter geologist goalkeeper governor historian illustrator instructor journalist librarian
  lieutenant magician manager mechanic messenger navigator novelist paramedic pharmacist philosopher
  photographer physicist politician president programmer psychologist receptionist researcher
  sergeant shepherd spectator storyteller strategist superhero technician translator treasurer
  volunteer grandfather grandmother daughter brother husband children family stranger audience
`;

const ACTIONS = `
  add ask bake beg bend bind bite blow boil bow buy call camp care carry cast catch chase cheer chew chop
  claim clap climb close coil cook count cover crack crawl cross crush dance dare dash deal dig dive draft
  drag draw dream dress drift drink drive drop earn eat edit enter erase fade fail fall feed feel fetch
  fight fill find fire fish fix flee flip float flow fly fold follow forge form gain gather gaze give glide
  grab grasp greet grin grind grip grow guard guess guide hang hatch haul heal hear help hide hike hold hop
  hope hover hum hunt hurry jog join judge jump keep kick kneel knit knock know laugh lead lean leap learn
  lend lift light limp link listen live load lock look loop love make march mark melt mend mix mold move
  nod note obey offer open order paint pass pause pay peek pick pitch place plan plant play plead point
  polish pour praise pray press print pull pump punch push quit race raise reach read relax rely repair
  reply rescue rest return ride ring rise roam roar roll rotate row rush sail save say scan scatter search
  seek sell send serve sew shake shape share shift shine shoot shout show shrink sigh sing sink sit skate
  sketch ski skip sleep slide slip smile sniff snore soar solve sort speak spell spend spin splash spread
  sprint stack stand stare start stay steer step stir stomp stop store stretch stroll study suggest swim
  swing switch tackle talk taste teach tear tell thank think throw tickle tidy toss touch trace trade
  train travel treat trust try tumble turn twist type unite unlock vanish visit wade wait wake walk wander
  want warn wash watch wave weave whisper whistle win wink wish wonder work worry wrap write yawn yell zoom
  achieve adjust admire advance announce appear applaud approach arrange arrive assemble attack attempt
  balance belong borrow breathe brighten bubble calculate capture celebrate challenge change chatter
  collect combine compete complain complete concentrate connect consider construct continue create
  decide decorate defend deliver describe deserve design destroy develop discover discuss disappear
  divide educate embrace encourage escape establish examine exercise expand explain explore express
  flourish forgive gallop giggle glisten govern graduate grumble hesitate identify imagine improve
  include increase inform inspect inspire install interrupt introduce invent invite juggle measure
  memorize navigate negotiate observe organize overcome paddle participate perform persuade practice
  prepare preserve pretend prevent produce progress promise protect provide publish question realize
  recognize recommend recover reflect remember remove request respond restore reveal scramble shimmer
  sparkle stumble succeed support surprise surrender survive sustain teleport tremble triumph
  understand volunteer whistle wobble wriggle
`;

const QUALITIES = `
  bad big dry far fit hot icy new odd old raw red sad shy wet bold brave calm cold cool cozy cute dark deep
  dull easy epic fair fast fine firm flat fond free full glad gold good gray grim hard high huge just keen
  kind lazy lean live lone long loud loyal lucky mild neat nice open pale pink pure quick rare real rich ripe
  safe sharp short shy slim slow smart soft solid sour spare stark stiff still sweet swift tall tame thick
  thin tidy tiny tough true vast warm weak whole wide wild wise young agile alert amber ample azure basic
  blank bland bleak blind bliss blond brief brisk broad candid casual cheap chief chilly civil clean clear
  clever close cloudy coarse crisp cruel curly daily dainty dense dizzy eager early empty equal exact extra
  faint fancy fatal fierce final fluffy foggy formal frank fresh frosty funny fuzzy gentle giant glossy
  golden grand great green greedy happy hardy harsh hasty heavy hidden hollow honest humble hungry ideal
  jolly juicy jumbo large legal level light lively local lonely lovely lunar magic major mellow merry messy
  mighty minor misty modern modest moist muddy narrow native noble noisy normal nutty orange polite
  precise pretty proper proud purple quiet rapid ready regal rigid rocky rough round royal rusty sandy
  scarce secret serene shabby shiny silent silky silly simple sleek sleepy slick slight smooth snowy sober
  sparse speedy spicy steady steep sticky stormy strong sturdy subtle sunny super superb tender tidy timid
  tired total tricky trusty upbeat urban usual vague valid vivid wacky wealthy weary windy witty wooden
  worthy yellow zesty absolute abundant accurate adorable advanced amazing ancient anxious arctic
  artistic athletic awesome balanced beautiful brilliant careful cautious cheerful colorful comfortable
  confident courageous creative curious delicate delicious determined diligent distant dramatic durable
  elegant enormous essential excellent excited exotic famous fantastic fearless flexible fortunate
  fragile friendly generous genuine glorious graceful grateful gigantic harmonious helpful hilarious
  historic hopeful imaginary immense impressive incredible innocent intense invisible jubilant
  legendary luminous magnificent majestic marvelous massive mysterious natural nervous obvious optimistic
  ordinary organic peaceful perfect pleasant plentiful powerful practical precious radiant reliable
  remarkable resilient sensible serious shimmering significant sincere skillful spectacular splendid
  spontaneous stubborn successful sufficient terrific thoughtful tranquil tremendous triumphant
  unusual valuable vibrant victorious virtual wonderful
`;

const IDEAS = `
  aim art awe era ego fun joy law luck mood myth need oath pact plan rule soul tale task time view will wish
  zeal truth faith fame glory grace guilt habit honor humor irony karma logic lore magic mercy merit mirth
  order peace pride quest realm reign skill spirit theme trust unity value valor vigor virtue wisdom world
  wonder youth advice anger beauty belief bounty bravery chance chaos choice comfort courage culture custom
  danger desire destiny detail dignity effort energy enigma escape estate ethics fable family fashion
  fiction folly fortune freedom future genius gossip harmony health heaven heritage history honesty
  hunger instinct journey justice kindness knowledge legacy legend leisure liberty lifetime loyalty memory
  method miracle mission mystery nation nature notion option origin passion patience pattern pleasure
  poetry policy potential power progress promise purpose reason rhythm riddle sacred science secret
  silence society sorrow spirit strategy strength success symbol talent tension theory thought tradition
  triumph venture victory vision welfare wealth ability adventure affection ambition analysis anthem
  balance blessing calendar ceremony champion character charity civilization collection comedy
  community compassion competition confidence conscience creativity curiosity democracy determination
  development discipline discovery education emotion empathy encounter enthusiasm environment evidence
  evolution excellence experience experiment expression friendship generation generosity gratitude
  happiness hospitality imagination independence information innovation inspiration intelligence
  invention leadership literature meditation melody momentum motivation narrative opportunity
  perspective philosophy possibility prosperity reflection relationship reputation responsibility
  revolution satisfaction serenity solitude solution spectacle tournament tranquility understanding
  universe vocabulary
`;

const PLACES = `
  bay city den farm fort hall inn lab mall mill park port shop spa zoo arena attic bank bazaar cafe camp
  clinic coast court diner dock dome forum gallery garage harbor hotel house hut kiosk lodge manor market
  motel museum office palace pier plaza prison pub ranch resort school shrine stadium store street studio
  suburb temple theater tower town valley village vineyard warehouse academy airport alley avenue bakery
  bridge canal capital cathedral cemetery chapel citadel college colony corridor county district embassy
  factory fortress fountain highway hospital kingdom library lighthouse marina monastery monument
  neighborhood observatory orchard parliament pavilion pharmacy playground province railway restaurant
  sanctuary skyscraper stadium supermarket territory theater university workshop amphitheater
  aquarium boulevard checkpoint crossroads headquarters laboratory marketplace planetarium
`;

const MUSIC_SPORT = `
  bass drum flute harp horn lute oboe tuba band beat chord choir gong hymn jazz note opera solo song tone
  tune verse banjo cello piano rhythm violin guitar trumpet trombone clarinet saxophone harmonica accordion
  xylophone orchestra symphony concerto melody harmony lullaby anthem ballad chorus encore lyric tempo
  sonata album concert festival acoustic soundtrack microphone amplifier ball bat bike golf goal kick lap
  net pass race ring run shot skis surf swim team win yoga chess darts dodge rugby score skate track
  archery athlete badminton baseball basketball biking boxing canoe cricket cycling diving fencing
  football gymnast hockey javelin jogging karate kayak marathon medal olympic paddle penalty pitcher
  podium polo rowing sailing skiing soccer softball sprint stadium striker surfing swimming tennis trophy
  volleyball wrestling champion championship quarterback skateboard snowboard tournament trampoline
`;

const MISC = `
  age air bell bone book card clue coin crown dial disk drum edge flag fork gem gift glue harp jewel kite
  knot lace mask maze nail note oar page path pipe puzzle rope sail seal sign silk spark spool sword tent
  thread ticket torch toy trap tray tube vault wheel whip wire yarn anchor arrow badge banner barrel blade
  bottle bridge bubble buckle candle canvas castle chain chalk compass crate dagger diary dice engine
  feather fossil gadget goblet hammock helmet jigsaw kayak ladder lantern locket magnet marble medal
  mirror mitten necklace paddle parcel pendant pocket portal potion pyramid quiver rocket saddle scroll
  shield statue string target teapot thimble trumpet tunnel wagon whistle anthology artifact boomerang
  carousel catapult chandelier compass hourglass kaleidoscope labyrinth lighthouse microscope parachute
  periscope submarine telescope treasure trapdoor windmill avalanche earthquake eruption expedition
  horizon landmark milestone overture panorama silhouette spotlight starboard telegraph timeline
  voyage waterline whirlpool
`;

const POOL = [SPACE, NATURE, ANIMALS, FOOD, HOME, TECH, PEOPLE, ACTIONS, QUALITIES, IDEAS, PLACES, MUSIC_SPORT, MISC]
  .join(' ')
  .split(/\s+/)
  .filter((w) => /^[a-z]{3,16}$/.test(w));

const tierOf = (w: string): Tier => (w.length <= 4 ? 'short' : w.length <= 6 ? 'medium' : w.length <= 9 ? 'long' : 'xlong');

export const WORDS: Record<Tier, readonly string[]> = (() => {
  const out: Record<Tier, string[]> = { short: [], medium: [], long: [], xlong: [] };
  for (const w of new Set(POOL)) out[tierOf(w)].push(w);
  return out;
})();
