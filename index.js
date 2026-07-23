require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  PermissionFlagsBits,
  Events
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const GUILD_ID = '1493598034544820284'; 

const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Sends the professional middleman panel to a specified channel')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel where the panel should be sent')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}!`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('Clearing old commands and registering /panel...');

    await rest.put(
      Routes.applicationGuildCommands(c.user.id, GUILD_ID),
      { body: commands },
    );

    await rest.put(
      Routes.applicationCommands(c.user.id),
      { body: [] },
    );

    console.log('Successfully updated commands. Only /panel should remain.');
  } catch (error) {
    console.error(error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'panel') {
      try {
        // Defer reply immediately so Discord knows we are processing
        await interaction.deferReply({ ephemeral: true });

        const targetChannel = interaction.options.getChannel('channel');

        // Check channel permissions safely
        if (!targetChannel || !targetChannel.permissionsFor(interaction.guild.members.me).has(['SendMessages', 'ViewChannel'])) {
          return await interaction.editReply({ 
            content: '❌ I do not have permissions to view or send messages in that channel!' 
          });
        }

        const panelEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🛡️ Secure Automated Middleman Service')
          .setDescription('Welcome to our trusted escrow and middleman service. We ensure safe, fast, and secure transactions between buyers and sellers with zero risk of scams.')
          .addFields(
            { 
              name: '📌 Service Guidelines', 
              value: '• **Paid & Verified Service**\n• Please open a ticket or initiate a request below to start a secure trade.\n• Always verify you are dealing with the official bot/middleman.' 
            },
            { 
              name: '💰 Fee Structure', 
              value: '• **Deals $250+:** $1.50\n• **Deals under $250:** $0.50\n• **Deals under $50:** **FREE**' 
            },
            { 
              name: '🔒 Security & Guarantee', 
              value: 'All transactions are monitored and handled safely. We are not responsible for trades conducted outside of official middleman tickets.' 
            }
          )
          .setTimestamp()
          .setFooter({ text: 'Auto Middleman Security System', iconURL: interaction.client.user.displayAvatarURL() });

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('request_ltc')
            .setLabel('Request Litecoin [LTC]')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('💎'),
          new ButtonBuilder()
            .setCustomId('request_usdt')
            .setLabel('Request USDT [BEP-20]')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🟢')
        );

        // Send the panel to the target channel
        await targetChannel.send({
          embeds: [panelEmbed],
          components: [row1]
        });

        // Clear the thinking state and show success to the admin
        await interaction.editReply({ 
          content: `✅ Successfully sent the middleman panel to ${targetChannel}!` 
        });

      } catch (err) {
        console.error(err);
        // Fallback catch to ensure "thinking" state is always dismissed if an error occurs
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: '❌ An error occurred while executing this command.' }).catch(() => {});
        } else {
          await interaction.reply({ content: '❌ An error occurred while executing this command.', ephemeral: true }).catch(() => {});
        }
      }
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'request_ltc') {
      await interaction.reply({ 
        content: '🪙 You selected **Litecoin (LTC)**. A secure session/ticket will be processed for your request shortly!', 
        ephemeral: true 
      });
    } else if (interaction.customId === 'request_usdt') {
      await interaction.reply({ 
        content: '🟢 You selected **USDT [BEP-20]**. A secure session/ticket will be processed for your request shortly!', 
        ephemeral: true 
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
