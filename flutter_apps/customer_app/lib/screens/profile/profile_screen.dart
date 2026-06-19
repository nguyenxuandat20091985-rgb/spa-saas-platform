import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/utils/formatters.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Profile', style: GoogleFonts.playfairDisplay()),
        actions: [
          IconButton(icon: const Icon(Icons.settings_outlined), onPressed: () {}),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Profile Card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF2C3E50), Color(0xFF4A6B8A)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                children: [
                  const CircleAvatar(
                    radius: 40,
                    backgroundColor: Colors.white24,
                    child: Icon(Icons.person, color: Colors.white, size: 40),
                  ),
                  const SizedBox(height: 16),
                  Text('Khách hàng', style: GoogleFonts.playfairDisplay(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.gold.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text('Member', style: TextStyle(color: AppColors.gold, fontWeight: FontWeight.w600, fontSize: 12)),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _ProfileStat(label: 'Tổng chi tiêu', value: AppFormatters.currency(0)),
                      Container(width: 1, height: 32, color: Colors.white24),
                      _ProfileStat(label: 'Lượt đến', value: '0'),
                      Container(width: 1, height: 32, color: Colors.white24),
                      _ProfileStat(label: 'Điểm', value: '0'),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Membership
            _SectionCard(
              title: 'Membership',
              icon: Icons.card_membership,
              children: [
                _MembershipTier(name: 'Silver', discount: '5%', icon: Icons.star_border, color: AppColors.silver, isCurrent: false),
                _MembershipTier(name: 'Gold', discount: '10%', icon: Icons.star_half, color: AppColors.gold, isCurrent: false),
                _MembershipTier(name: 'Platinum', discount: '15%', icon: Icons.star, color: const Color(0xFFE5E4E2), isCurrent: false),
                _MembershipTier(name: 'Diamond', discount: '20%', icon: Icons.diamond, color: AppColors.diamond, isCurrent: false),
              ],
            ),
            const SizedBox(height: 16),

            // Loyalty
            _SectionCard(
              title: 'Loyalty & Voucher',
              icon: Icons.card_giftcard,
              children: [
                ListTile(
                  leading: const Icon(Icons.loyalty, color: AppColors.primary),
                  title: const Text('Điểm thưởng'),
                  subtitle: const Text('0 điểm'),
                  trailing: TextButton(onPressed: () {}, child: const Text('Lịch sử')),
                ),
                ListTile(
                  leading: const Icon(Icons.local_offer, color: AppColors.accent),
                  title: const Text('Voucher'),
                  subtitle: const Text('0 voucher'),
                  trailing: TextButton(onPressed: () {}, child: const Text('Xem tất cả')),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Menu
            _SectionCard(
              title: 'Menu',
              icon: Icons.menu,
              children: [
                _MenuItem(icon: Icons.history, title: 'Lịch sử dịch vụ', onTap: () {}),
                _MenuItem(icon: Icons.shopping_bag, title: 'Đơn hàng', onTap: () {}),
                _MenuItem(icon: Icons.face, title: 'Hồ sơ da', onTap: () {}),
                _MenuItem(icon: Icons.help_outline, title: 'Trợ giúp', onTap: () {}),
                _MenuItem(icon: Icons.info_outline, title: 'Giới thiệu', onTap: () {}),
                _MenuItem(icon: Icons.logout, title: 'Đăng xuất', onTap: () {}, color: AppColors.error),
              ],
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _ProfileStat extends StatelessWidget {
  final String label;
  final String value;

  const _ProfileStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 4),
        Text(label, style: GoogleFonts.inter(color: Colors.white60, fontSize: 11)),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final List<Widget> children;

  const _SectionCard({required this.title, required this.icon, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.divider, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Row(
              children: [
                Icon(icon, color: AppColors.primary, size: 20),
                const SizedBox(width: 8),
                Text(title, style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          ...children,
        ],
      ),
    );
  }
}

class _MembershipTier extends StatelessWidget {
  final String name;
  final String discount;
  final IconData icon;
  final Color color;
  final bool isCurrent;

  const _MembershipTier({required this.name, required this.discount, required this.icon, required this.color, required this.isCurrent});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: color),
      title: Text(name),
      subtitle: Text('Giảm $discount'),
      trailing: isCurrent
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.success.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text('Hiện tại', style: TextStyle(color: AppColors.success, fontSize: 12)),
            )
          : null,
    );
  }
}

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final Color? color;

  const _MenuItem({required this.icon, required this.title, required this.onTap, this.color});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: color ?? AppColors.textSecondary),
      title: Text(title, style: TextStyle(color: color)),
      trailing: const Icon(Icons.chevron_right, size: 20, color: AppColors.textHint),
      onTap: onTap,
    );
  }
}
