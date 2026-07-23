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

const GUILD_ID = '1493598034544820284'; 
const TICKET_CATEGORY_ID = '1515929427345674341';
const MIDDLEMAN_ADDRESS = 'LbHndHWHHYcCx8PY9ZYEnoaYyXeeui1LrE';

// In-memory store for active ticket states
// ticketId -> { coin, sender, receiver, roles: {sender, receiver}, amountUSD, status, addressInputStep }
const tickets = new Map();

// Helper to fetch live crypto prices
async function getCryptoPrices() {
  let ltcPrice = 47.00; // fallback
  let usdtPrice = 1.00;
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=litecoin,tether&vs_currencies=usd');
    const data = await res.json();
    if (data.litecoin && data.litecoin.usd) ltcPrice = data.litecoin.usd;
    if (data.tether && data.tether.usd) usdtPrice = data.tether.usd;
  } catch (e) {
    console.error('Failed to fetch live crypto prices, using fallbacks.', e);
  }
  return { ltcPrice, usdtPrice };
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
    .setDescription('Closes the current middleman ticket')
].map(command => command.toJSON());

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}!`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    await rest.put(Routes.applicationGuildCommands(c.user.id, GUILD_ID), { body: commands });
    await rest.put(Routes.applicationCommands(c.user.id), { body: [] });
    console.log('Successfully registered /panel and /close commands.');
  } catch (error) {
    console.error(error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'panel') {
      await interaction.deferReply({ ephemeral: true });
      const targetChannel = interaction.options.getChannel('channel');

      if (!targetChannel || !targetChannel.permissionsFor(interaction.guild.members.me).has(['SendMessages', 'ViewChannel'])) {
        return interaction.editReply({ content: '❌ I do not have permissions to view or send messages in that channel!' });
      }

      const panelEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🛡️ Secure Automated Middleman Service')
        .setDescription('Welcome to our trusted escrow and middleman service. We ensure safe, fast, and secure transactions between buyers and sellers with zero risk of scams.')
        .addFields(
          { name: '📌 Service Guidelines', value: '• **Paid & Verified Service**\n• Please open a ticket or initiate a request below to start a secure trade.\n• Always verify you are dealing with the official bot/middleman.' },
          { name: '💰 Fee Structure', value: '• **Deals $250+:** $1.50\n• **Deals under $250:** $0.50\n• **Deals under $50:** **FREE**' },
          { name: '🔒 Security & Guarantee', value: 'All transactions are monitored and handled safely. We are not responsible for trades conducted outside of official middleman tickets.' }
        )
        .setTimestamp()
        .setFooter({ text: 'Auto Middleman Security System', iconURL: client.user.displayAvatarURL() });

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('request_ltc').setLabel('Request Litecoin [LTC]').setStyle(ButtonStyle.Primary).setEmoji('💎'),
        new ButtonBuilder().setCustomId('request_usdt').setLabel('Request USDT [BEP-20]').setStyle(ButtonStyle.Success).setEmoji('🟢')
      );

      await targetChannel.send({ embeds: [panelEmbed], components: [row1] });
      await interaction.editReply({ content: `✅ Successfully sent the middleman panel to ${targetChannel}!` });
    }

    if (interaction.commandName === 'close') {
      if (!interaction.channel.name.startsWith('ticket-')) {
        return interaction.reply({ content: '❌ This command can only be used inside an active ticket channel.', ephemeral: true });
      }
      await interaction.reply({ content: '🔒 Closing this ticket in 5 seconds...' });
      setTimeout(async () => {
        try { await interaction.channel.delete(); } catch (e) {}
      }, 5000);
    }
  }

  if (interaction.isButton()) {
    // 1. Panel Button Clicks -> Open Ticket
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
          amountUSD: 0,
          status: 'waiting_partner'
        });

        const welcomeEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Cryptocurrency Middleman System')
          .setDescription(`${coin} Middleman request created successfully!\n\nWelcome to our automated cryptocurrency Middleman system! Your cryptocurrency will be stored securely for the duration of this deal.\nPlease notify support for assistance.\n\nTicket #${ticketNum}`);

        const securityEmbed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('Security Notification')
          .setDescription('Our bot and staff team will **NEVER** direct message you. Ensure all conversations related to the deal are done within this ticket. Failure to do so may put you at risk of being scammed.');

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Secondary).setEmoji('🔒')
        );

        await ticketChannel.send({ embeds: [welcomeEmbed, securityEmbed], components: [closeRow] });

        const promptMsg = await ticketChannel.send({
          content: `<@${interaction.user.id}>\nWho are dealing with?\neg. @user\neg. 128456789123456789`
        });
        
        tickets.get(ticketChannel.id).promptMsgId = promptMsg.id;

        await interaction.editReply({ content: `✅ Ticket created successfully: <#${ticketChannel.id}>` });
      } catch (err) {
        console.error(err);
        await interaction.editReply({ content: '❌ Failed to create ticket channel. Check category permissions.' });
      }
    }

    // Close Button handler
    if (interaction.customId === 'close_ticket') {
      await interaction.reply({ content: '🔒 Closing ticket in 5 seconds...', ephemeral: true });
      setTimeout(async () => {
        try { await interaction.channel.delete(); } catch (e) {}
      }, 5000);
    }

    // Role Assignment Buttons
    if (['role_sending', 'role_receiving', 'role_reset'].includes(interaction.customId)) {
      const ticketData = tickets.get(interaction.channel.id);
      if (!ticketData) return;

      const userId = interaction.user.id;
      if (userId !== ticketData.sender && userId !== ticketData.receiver) {
        return interaction.reply({ content: '❌ You are not part of this deal.', ephemeral: true });
      }

      if (interaction.customId === 'role_reset') {
        ticketData.roleChoices[userId] = null;
      } else {
        const chosenRole = interaction.customId === 'role_sending' ? 'Sending' : 'Receiving';
        // Enforce restriction: user cannot select multiple roles unless reset
        ticketData.roleChoices[userId] = chosenRole;
      }

      // Check if both selected roles
      const senderRole = ticketData.roleChoices[ticketData.sender] || 'None';
      const receiverRole = ticketData.roleChoices[ticketData.receiver] || 'None';

      const roleEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Role Assignment')
        .setDescription(`Select one of the following buttons that corresponds to your role in this deal. Once selected, both users must confirm to proceed.\n\n**Sending Litecoin**\n${senderRole === 'Sending' ? `<@${ticketData.sender}>` : senderRole === 'Receiving' ? `<@${ticketData.receiver}>` : 'None'}\n**Receiving Litecoin**\n${receiverRole === 'Receiving' ? `<@${ticketData.receiver}>` : receiverRole === 'Sending' ? `<@${ticketData.sender}>` : 'None'}\n\nTicket will be closed in 30 minutes if left unattended`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('role_sending').setLabel('Sending').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_receiving').setLabel('Receiving').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_reset').setLabel('Reset').setStyle(ButtonStyle.Danger)
      );

      await interaction.update({ embeds: [roleEmbed], components: [row] });

      // If both picked distinct roles, move to role confirmation stage
      if (senderRole !== 'None' && receiverRole !== 'None' && senderRole !== receiverRole) {
        ticketData.roles.sender = senderRole === 'Sending' ? ticketData.sender : ticketData.receiver;
        ticketData.roles.receiver = senderRole === 'Sending' ? ticketData.receiver : ticketData.sender;

        const confirmEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('Confirm Roles')
          .setDescription(`Sender\n<@${ticketData.roles.sender}>\nReceiver\n<@${ticketData.roles.receiver}>\n\nSelecting the wrong role will result in getting scammed`);

        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('role_confirm_correct').setLabel('Correct').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('role_confirm_incorrect').setLabel('Incorrect').setStyle(ButtonStyle.Secondary)
        );

        await interaction.channel.send({ embeds: [confirmEmbed], components: [confirmRow] });
      }
    }

    // Confirm Roles: Correct
    if (interaction.customId === 'role_confirm_correct') {
      const ticketData = tickets.get(interaction.channel.id);
      await interaction.reply({ content: `<@${interaction.user.id}> has responded with 'Correct'` });

      // Prompt sender for deal amount
      const amountPrompt = await interaction.channel.send({
        content: `<@${ticketData.roles.sender}>`,
        embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Deal Amount').setDescription('State the amount the bot is expected to receive in USD (eg. 100.59)\n\nTicket will be closed in 30 minutes if left unattended')]
      });
      ticketData.amountPromptMsgId = amountPrompt.id;
      ticketData.status = 'awaiting_amount';
    }

    // Confirm Amount: Correct
    if (interaction.customId === 'amount_confirm_correct') {
      const ticketData = tickets.get(interaction.channel.id);
      await interaction.reply({ content: `<@${interaction.user.id}> has confirmed the deal amount.` });

      // Generate invoice
      const { ltcPrice, usdtPrice } = await getCryptoPrices();
      const isLtc = ticketData.coin.includes('Litecoin');
      const rate = isLtc ? ltcPrice : usdtPrice;
      const cryptoAmount = (ticketData.amountUSD / rate).toFixed(isLtc ? 6 : 2);

      const summaryEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📋 Deal Summary')
        .setDescription('Refer to this deal summary for any reaffirmations. Notify staff for any support required.')
        .addFields(
          { name: 'Sender', value: `<@${ticketData.roles.sender}>`, inline: false },
          { name: 'Receiver', value: `<@${ticketData.roles.receiver}>`, inline: false },
          { name: 'Deal Value', value: `$${ticketData.amountUSD.toFixed(2)}`, inline: false },
          { name: 'Coin', value: isLtc ? ' Litecoin (LTC)' : ' Tether (USDT)', inline: false }
        );

      const invoiceEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📬 Payment Invoice')
        .setDescription(`<@${ticketData.roles.sender}> Send the funds as part of the deal to the Middleman address specified below. Please copy the amount provided.`)
        .addFields(
          { name: 'Address', value: MIDDLEMAN_ADDRESS, inline: false },
          { name: 'Amount', value: `${cryptoAmount} ${isLtc ? 'LTC' : 'USDT'} ($${ticketData.amountUSD.toFixed(2)} USD)`, inline: false },
          { name: 'Exchange Rate', value: `1 ${isLtc ? 'LTC' : 'USDT'} = $${rate.toFixed(2)} USD`, inline: false }
        );

      const copyRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('copy_details').setLabel('Copy Details').setStyle(ButtonStyle.Secondary)
      );

      await interaction.channel.send({ embeds: [summaryEmbed] });
      const invoiceMsg = await interaction.channel.send({ embeds: [invoiceEmbed], components: [copyRow] });

      const awaitingMsg = await interaction.channel.send({
        content: '⏳ Awaiting transaction...'
      });

      // Simulate automatic transaction detection after 120 seconds
      setTimeout(async () => {
        try {
          await awaitingMsg.delete();

          const successTxEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Payment Received')
            .setDescription('The payment is now secured, and has reached the required amount of confirmations.')
            .addFields(
              { name: 'Transaction', value: '8fd59f...987390', inline: false },
              { name: 'Confirmations', value: '1', inline: false },
              { name: 'Amount Received', value: `${cryptoAmount} ${isLtc ? 'LTC' : 'USDT'} ($${ticketData.amountUSD.toFixed(2)} USD)`, inline: false }
            );

          const readyEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setDescription(`You may now proceed with the deal\n\nThe receiver (<@${ticketData.roles.receiver}>) may now provide the goods to the sender (<@${ticketData.roles.sender}>).\n\nOnce the deal is complete, the sender must click the 'Release' button below to release the funds to the receiver & complete the deal.`);

          const releaseRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('trigger_release').setLabel('Release').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('trigger_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
          );

          await interaction.channel.send({
            content: `<@${ticketData.roles.sender}> <@${ticketData.roles.receiver}>`,
            embeds: [successTxEmbed, readyEmbed],
            components: [releaseRow]
          });
        } catch (e) {}
      }, 120000); // 120 seconds
    }

    // Copy Details button
    if (interaction.customId === 'copy_details') {
      const ticketData = tickets.get(interaction.channel.id);
      const { ltcPrice, usdtPrice } = await getCryptoPrices();
      const isLtc = ticketData.coin.includes('Litecoin');
      const cryptoAmount = (ticketData.amountUSD / (isLtc ? ltcPrice : usdtPrice)).toFixed(isLtc ? 6 : 2);

      await interaction.reply({
        content: `${MIDDLEMAN_ADDRESS}\n${cryptoAmount}\nCopy the payment details above. No funds have been recieved yet.`,
        ephemeral: true
      });
    }

    // Trigger Release Confirmation
    if (interaction.customId === 'trigger_release') {
      const ticketData = tickets.get(interaction.channel.id);
      if (interaction.user.id !== ticketData.roles.sender) {
        return interaction.reply({ content: '❌ Only the sender can click the release button.', ephemeral: true });
      }

      const releaseConfirmEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Release Confirmation')
        .setDescription(`Are you sure you would like to release the funds to receiver, <@${ticketData.roles.receiver}>?\n\nOnce this is confirmed, the funds will be released, and the deal will be marked as complete.\n\n**Staff will never DM you to release**`);

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('release_final_confirm').setLabel('Confirm').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('release_back').setLabel('Back').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [releaseConfirmEmbed], components: [confirmRow], ephemeral: true });
    }

    // Final Release Confirmation -> Ask Receiver Address
    if (interaction.customId === 'release_final_confirm') {
      const ticketData = tickets.get(interaction.channel.id);
      await interaction.update({ content: '✅ Release confirmed.', embeds: [], components: [] });

      const addressPrompt = await interaction.channel.send({
        content: `<@${ticketData.roles.receiver}>`,
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`Provide your ${ticketData.coin.includes('Litecoin') ? 'Litecoin' : 'USDT'} address`).setDescription(`The deal is now complete! Paste your ${ticketData.coin.includes('Litecoin') ? 'Litecoin' : 'USDT'} address below to initiate the release from the Middleman wallet.`)]
      });
      ticketData.receiverAddressPromptId = addressPrompt.id;
      ticketData.status = 'awaiting_receiver_address';
    }

    // Address Confirmation -> Finalize Release
    if (interaction.customId === 'address_confirm_yes') {
      const ticketData = tickets.get(interaction.channel.id);
      await interaction.update({ content: '✅ Address confirmed. Releasing payment...', embeds: [], components: [] });

      const { ltcPrice, usdtPrice } = await getCryptoPrices();
      const isLtc = ticketData.coin.includes('Litecoin');
      const cryptoAmount = (ticketData.amountUSD / (isLtc ? ltcPrice : usdtPrice)).toFixed(isLtc ? 6 : 2);

      const releaseEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Payment Released')
        .setDescription(`The ${isLtc ? 'Litecoin' : 'USDT'} has been released successfully to the address provided!`)
        .addFields(
          { name: 'Amount', value: `${cryptoAmount} ${isLtc ? 'LTC' : 'USDT'} ($${ticketData.amountUSD.toFixed(2)} USD)`, inline: false },
          { name: 'Transaction', value: '7c2846...0c4a88', inline: false }
        );

      const completeEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Deal Complete!')
        .setDescription(`Thanks for using our auto mm service! This deal is now marked as complete.\n\nWe hope you are satisfied with our service.\n\nThis ticket will be closed in 5 minutes`);

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Secondary)
      );

      await interaction.channel.send({
        content: `<@${ticketData.roles.sender}> <@${ticketData.roles.receiver}>`,
        embeds: [releaseEmbed, completeEmbed],
        components: [closeRow]
      });

      // Auto close after 5 minutes (300,000 ms)
      setTimeout(async () => {
        try { await interaction.channel.delete(); } catch (e) {}
      }, 300000);
    }
  }
});

// Handle text messages in tickets (Adding partner, entering amount, entering receiver address)
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (!message.channel.name.startsWith('ticket-')) return;

  const ticketData = tickets.get(message.channel.id);
  if (!ticketData) return;

  // Step 1: Adding Partner
  if (ticketData.status === 'waiting_partner' && message.author.id === ticketData.sender) {
    let targetUser = message.mentions.users.first();
    if (!targetUser) {
      const cleanedId = message.content.replace(/[^0-9]/g, '');
      try {
        targetUser = await client.users.fetch(cleanedId);
      } catch (e) {}
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
        .setDescription(`Successfully added <@${targetUser.id}> to the ticket.\n\nSelect one of the following buttons that corresponds to your role in this deal. Once selected, both users must confirm to proceed.\n\n**Sending ${ticketData.coin.includes('Litecoin') ? 'Litecoin' : 'USDT'}**\nNone\n**Receiving ${ticketData.coin.includes('Litecoin') ? 'Litecoin' : 'USDT'}**\nNone\n\nTicket will be closed in 30 minutes if left unattended`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('role_sending').setLabel('Sending').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_receiving').setLabel('Receiving').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_reset').setLabel('Reset').setStyle(ButtonStyle.Danger)
      );

      await message.channel.send({ embeds: [roleEmbed], components: [row] });
    }
  }

  // Step 2: Entering Deal Amount
  else if (ticketData.status === 'awaiting_amount' && message.author.id === ticketData.roles.sender) {
    const val = parseFloat(message.content);
    if (!isNaN(val) && val > 0) {
      ticketData.amountUSD = val;
      ticketData.status = 'confirming_amount';

      const amountConfirmEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Amount Confirmation')
        .setDescription(`Confirm that the bot will receive the following USD value\n\nAmount\n$${val.toFixed(2)}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('amount_confirm_correct').setLabel('Correct').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('amount_confirm_incorrect').setLabel('Incorrect').setStyle(ButtonStyle.Secondary)
      );

      await message.channel.send({ embeds: [amountConfirmEmbed], components: [row] });
    }
  }

  // Step 3: Entering Receiver Address
  else if (ticketData.status === 'awaiting_receiver_address' && message.author.id === ticketData.roles.receiver) {
    const address = message.content.trim();
    if (address.length > 10) {
      ticketData.receiverCryptoAddress = address;
      ticketData.status = 'completed';

      const verifyAddressEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`Is this your ${ticketData.coin.includes('Litecoin') ? 'Litecoin' : 'USDT'} address?`)
        .setDescription(`Please verify that the address you provided is correct. Once the funds are released, they cannot be retrieved.\n\nAddress\n${address}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('address_confirm_yes').setLabel('Confirm').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('address_confirm_no').setLabel('Back').setStyle(ButtonStyle.Secondary)
      );

      await message.channel.send({ embeds: [verifyAddressEmbed], components: [row] });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
