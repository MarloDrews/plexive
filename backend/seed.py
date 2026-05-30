from app.database import Base, SessionLocal, engine
from app.models import Interest, Post, post_interests

Base.metadata.create_all(bind=engine)

db = SessionLocal()

db.execute(post_interests.delete())
db.query(Post).delete()
db.query(Interest).delete()
db.commit()

politics = Interest(name="Politics", slug="politics")
technology = Interest(name="Technology", slug="technology")
business = Interest(name="Business", slug="business")
self_improvement = Interest(name="Self-improvement", slug="self-improvement")
science = Interest(name="Science", slug="science")
philosophy = Interest(name="Philosophy", slug="philosophy")
history = Interest(name="History", slug="history")

db.add_all([politics, technology, business, self_improvement, science, philosophy, history])
db.flush()

posts = [
    # books
    Post(
        format="books",
        title="The Private Journal of a Roman Emperor",
        body=(
            "Marcus Aurelius never intended his personal writings to be published — "
            "they were reminders he wrote to himself about how to live well under pressure. "
            "He wrestles with impermanence, the irrelevance of fame, and the Stoic duty to act "
            "reasonably regardless of circumstances. Reading them feels like finding a great mind "
            "arguing with itself, which is what makes them last two thousand years later."
        ),
        source="Meditations — Marcus Aurelius",
        interests=[philosophy, self_improvement],
    ),
    Post(
        format="books",
        title="How Free Markets Emerge from Self-Interest",
        body=(
            "Adam Smith showed in 1776 that when individuals pursue their own interests, "
            "they often produce outcomes that benefit everyone — a process he called the invisible hand. "
            "He demonstrated how specializing tasks dramatically increases output, using a pin factory "
            "as his famous example. The book laid the foundation for modern economics and remains the "
            "clearest argument ever written for why decentralized trade tends to outperform central planning."
        ),
        source="The Wealth of Nations — Adam Smith",
        interests=[business, history],
    ),
    Post(
        format="books",
        title="The Universe from the Big Bang to Black Holes",
        body=(
            "Stephen Hawking set out to explain the history and structure of the universe "
            "without a single equation, and largely succeeded. He covers how the Big Bang set "
            "time in motion, why black holes are not truly black, and whether the laws of physics "
            "allow a complete theory of everything. His central argument is that the universe "
            "follows consistent mathematical rules — which means science can, in principle, "
            "describe its own origins."
        ),
        source="A Brief History of Time — Stephen Hawking",
        interests=[science],
    ),

    # facts
    Post(
        format="facts",
        title="The 335-Year War With Zero Casualties",
        body=(
            "During the English Civil War, a Dutch admiral declared war on the Isles of Scilly "
            "off the coast of Cornwall — and then simply forgot to make peace. "
            "The Netherlands and the islands remained technically at war from 1651 until 1986, "
            "when a Dutch ambassador finally sent a letter ending the conflict. "
            "Not a single shot was ever fired, making it one of the longest and most peaceful "
            "wars in recorded history."
        ),
        interests=[history, politics],
    ),
    Post(
        format="facts",
        title="Why Octopus Blood Is Blue",
        body=(
            "An octopus has three hearts: two pump blood through its gills, while a third "
            "sends it to the rest of the body. Their blood is blue because it relies on "
            "hemocyanin — a copper-based molecule — to carry oxygen, rather than the "
            "iron-based hemoglobin that makes human blood red. "
            "This works efficiently in cold, oxygen-poor seawater but means octopuses "
            "tire very quickly when active."
        ),
        interests=[science],
    ),
    Post(
        format="facts",
        title="The Hidden Electricity Cost of the Internet",
        body=(
            "Data centers, network cables, routers, and the devices we use to connect "
            "collectively consume around 1,000 terawatt-hours of electricity per year — "
            "roughly 1% of global production. A single web search uses about 0.3 watt-hours, "
            "enough to run an LED bulb for a minute. "
            "As AI models grow larger and run billions of queries daily, that share "
            "is expected to rise sharply over the next decade."
        ),
        interests=[technology, science],
    ),

    # people
    Post(
        format="people",
        title="Ada Lovelace: The First Computer Programmer",
        body=(
            "In 1843, Ada Lovelace translated an Italian article about Charles Babbage's "
            "proposed Analytical Engine and added her own notes — three times longer than "
            "the original text. Those notes contained what is now considered the first "
            "published computer algorithm, designed to calculate Bernoulli numbers. "
            "More remarkably, she foresaw that such a machine could go beyond arithmetic "
            "to compose music or process any symbol that could be defined by rules — "
            "a vision not realized for another hundred years."
        ),
        interests=[technology, history],
    ),
    Post(
        format="people",
        title="Nikola Tesla: The Inventor Who Died Broke",
        body=(
            "Tesla developed the alternating current electrical system that became the "
            "global standard for power transmission, defeating Edison's direct current "
            "in almost every practical application. He also invented the Tesla coil, "
            "made foundational contributions to radio technology, and held over 300 patents. "
            "Despite his enormous influence, he sold his most important patents at a steep "
            "loss and died alone in a New York hotel room in 1943, nearly forgotten by "
            "the industry his work had built."
        ),
        interests=[technology, science],
    ),
    Post(
        format="people",
        title="Harriet Tubman: General of the Underground Railroad",
        body=(
            "After escaping slavery in 1849, Harriet Tubman returned south at least "
            "thirteen times and guided roughly seventy people to freedom via the "
            "Underground Railroad, never losing a single person. "
            "During the Civil War she served the Union Army as a spy, nurse, and cook, "
            "and in 1863 she led an armed river raid that liberated more than 700 enslaved people — "
            "the first military operation in American history planned and commanded by a woman."
        ),
        interests=[history, politics],
    ),

    # concepts
    Post(
        format="concepts",
        title="The Overton Window: How Radical Ideas Become Policy",
        body=(
            "The Overton Window describes the narrow band of ideas a society considers "
            "politically acceptable at any given moment. Positions outside the window "
            "are dismissed as extreme; those inside are debated and sometimes enacted. "
            "The window shifts over time — driven by activists, writers, crises, and "
            "cultural change — which is why policies that seemed unthinkable in one "
            "generation become law in the next, and why moving public opinion often "
            "matters more than winning individual arguments."
        ),
        interests=[politics, philosophy],
    ),
    Post(
        format="concepts",
        title="Compounding: The Force Behind Wealth and Skill",
        body=(
            "Compounding means that growth builds on itself: last period's gains "
            "become part of the base that generates next period's gains. "
            "In finance, a 10% annual return on $1,000 adds more each year because "
            "the principal keeps growing. The same logic applies to skills, knowledge, "
            "and reputation — consistent small improvements accumulate into dramatic "
            "long-term advantages, which is why beginning early and staying consistent "
            "beats any single large effort."
        ),
        interests=[business, self_improvement],
    ),
    Post(
        format="concepts",
        title="First Principles Thinking: Reasoning from Bedrock",
        body=(
            "First principles thinking means refusing to accept inherited assumptions "
            "and instead breaking a problem down to its most basic, verifiable truths. "
            "Elon Musk applied it to rocket manufacturing by asking what raw materials "
            "actually cost — realizing aerospace-grade aluminum and fuel were cheap "
            "commodities, and that the real expense was traditional manufacturing methods. "
            "It is the opposite of reasoning by analogy, which simply copies what "
            "already exists rather than asking what is actually possible."
        ),
        interests=[science, self_improvement],
    ),

    # questions
    Post(
        format="questions",
        title="Is Free Will Real, or Are We Just Complex Machines?",
        body=(
            "Neuroscience experiments have shown that brain activity associated with "
            "a decision can be detected by scanners several seconds before the person "
            "reports being aware they have decided — suggesting that conscious choice "
            "may be a story we tell ourselves after the fact. "
            "If every thought is the product of prior physical causes, responsibility "
            "and punishment start to look very different. "
            "The answer matters not just for philosophy but for criminal law, "
            "addiction treatment, and how we talk to ourselves."
        ),
        interests=[philosophy, science],
    ),
    Post(
        format="questions",
        title="What Would a Post-Scarcity Economy Actually Look Like?",
        body=(
            "If automation eliminates most paid work, the central question becomes "
            "who owns the machines — and therefore who receives the output. "
            "Some economists argue for universal basic income; others propose "
            "collective ownership of automated infrastructure or a dramatic "
            "shortening of the working week. "
            "The question forces us to examine what we actually value in work: "
            "income, purpose, social structure, or something harder to replace."
        ),
        interests=[technology, business],
    ),
    Post(
        format="questions",
        title="Would You Upload Your Mind to Live Forever?",
        body=(
            "If every connection in your brain were mapped and replicated on a server, "
            "the resulting system would have your memories, personality, and beliefs — "
            "but would it be you, or a copy that merely thinks it is? "
            "The question probes our intuitions about identity and what makes a "
            "person the same person over time. "
            "It also raises practical concerns: who controls the server, "
            "can the upload be deleted, and what legal rights would it hold?"
        ),
        interests=[philosophy, technology],
    ),

    # stories
    Post(
        format="stories",
        title="The Night Stalin's Death Almost Started World War III",
        body=(
            "When Stalin died in March 1953, Soviet leaders were so consumed by "
            "the internal power struggle that they delayed announcing his death "
            "for hours while factions maneuvered against each other. "
            "American intelligence, reading the unusual radio silence and troop movements, "
            "briefly placed nuclear-armed aircraft on heightened alert. "
            "The crisis passed when Beria, Malenkov, and Khrushchev agreed to share power — "
            "buying the world nearly a decade before its next near-miss over Cuba."
        ),
        interests=[history, politics],
    ),
    Post(
        format="stories",
        title="How a Single Equation Helped Crash the World Economy in 2008",
        body=(
            "In the early 2000s, a mathematical formula called the Gaussian copula "
            "let banks calculate the risk of bundled mortgage securities almost instantly, "
            "and they used it to create trillions of dollars of new financial products. "
            "The formula's fatal assumption was that housing prices in different cities "
            "were not correlated — that a collapse in Phoenix wouldn't affect Miami. "
            "When that assumption failed simultaneously across the entire country in 2007, "
            "the model gave no warning, and the global financial system collapsed within months."
        ),
        interests=[business, technology],
    ),
    Post(
        format="stories",
        title="The Man Who Saved the World by Disobeying Orders",
        body=(
            "On the night of September 26, 1983, Soviet officer Stanislav Petrov watched "
            "his early-warning screens report five incoming American nuclear missiles. "
            "His orders were clear: report the attack immediately, triggering a counter-strike. "
            "Instead he paused, reasoning that a real first strike would involve hundreds "
            "of missiles, not five, and reported a system malfunction. "
            "He was right — a rare sunlight reflection had fooled the satellites. "
            "His decision to distrust the machine may be the single most consequential "
            "act of disobedience in human history."
        ),
        interests=[history, science],
    ),
]

db.add_all(posts)
db.commit()
db.close()

print(f"Seeded 7 interests and {len(posts)} posts.")
