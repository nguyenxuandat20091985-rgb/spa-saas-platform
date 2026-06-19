import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/widgets/loading_widget.dart';
import 'package:spa_shared/utils/formatters.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('AI Spa Enterprise', style: GoogleFonts.playfairDisplay()),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () {},
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {},
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Revenue Cards
              Text('Doanh thu', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.4,
                children: [
                  StatCard(
                    title: 'Hôm nay',
                    value: AppFormatters.currency(0),
                    icon: Icons.today,
                    color: AppColors.primary,
                    growth: 0,
                  ),
                  StatCard(
                    title: 'Tuần này',
                    value: AppFormatters.currency(0),
                    icon: Icons.date_range,
                    color: AppColors.info,
                  ),
                  StatCard(
                    title: 'Tháng này',
                    value: AppFormatters.currency(0),
                    icon: Icons.calendar_month,
                    color: AppColors.success,
                    growth: 0,
                  ),
                  StatCard(
                    title: 'Năm nay',
                    value: AppFormatters.currency(0),
                    icon: Icons.analytics,
                    color: AppColors.accent,
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // KPI
              Text('KPI', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.6,
                children: const [
                  StatCard(
                    title: 'Ticket trung bình',
                    value: '0 VND',
                    icon: Icons.receipt_long,
                    color: AppColors.primary,
                  ),
                  StatCard(
                    title: 'Tỷ lệ giữ chân',
                    value: '0%',
                    icon: Icons.refresh,
                    color: AppColors.success,
                  ),
                  StatCard(
                    title: 'Tỷ lệ booking',
                    value: '0%',
                    icon: Icons.event_available,
                    color: AppColors.info,
                  ),
                  StatCard(
                    title: 'Hiệu suất NV',
                    value: '0%',
                    icon: Icons.person_pin,
                    color: AppColors.warning,
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Customer Segments
              Text('Khách hàng', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
                childAspectRatio: 1.0,
                children: const [
                  _CustomerSegmentCard(label: 'Khách mới', value: '0', icon: Icons.person_add, color: AppColors.success),
                  _CustomerSegmentCard(label: 'Khách VIP', value: '0', icon: Icons.star, color: AppColors.accent),
                  _CustomerSegmentCard(label: 'Ngủ quên', value: '0', icon: Icons.bedtime, color: AppColors.warning),
                  _CustomerSegmentCard(label: 'Sắp rời bỏ', value: '0', icon: Icons.exit_to_app, color: AppColors.error),
                  _CustomerSegmentCard(label: 'Tổng cộng', value: '0', icon: Icons.people, color: AppColors.info),
                  _CustomerSegmentCard(label: 'Quay lại', value: '0', icon: Icons.replay, color: AppColors.primary),
                ],
              ),
              const SizedBox(height: 24),

              // Today's Appointments
              Text('Lịch hẹn hôm nay', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.divider, width: 0.5),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _AppointmentStat(label: 'Tổng', value: '0', color: AppColors.textPrimary),
                        _AppointmentStat(label: 'Chờ xử lý', value: '0', color: AppColors.warning),
                        _AppointmentStat(label: 'Hoàn thành', value: '0', color: AppColors.success),
                        _AppointmentStat(label: 'Đã hủy', value: '0', color: AppColors.error),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Quick Actions
              Text('Thao tác nhanh', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _QuickAction(icon: Icons.add_circle, label: 'Thêm khách', onTap: () {}),
                  _QuickAction(icon: Icons.calendar_today, label: 'Đặt lịch', onTap: () {}),
                  _QuickAction(icon: Icons.point_of_sale, label: 'Bán hàng', onTap: () {}),
                  _QuickAction(icon: Icons.inventory, label: 'Nhập kho', onTap: () {}),
                  _QuickAction(icon: Icons.auto_awesome, label: 'AI Tư vấn', onTap: () {}),
                  _QuickAction(icon: Icons.campaign, label: 'Marketing', onTap: () {}),
                ],
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}

class _CustomerSegmentCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _CustomerSegmentCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 8),
          Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
          Text(label, style: const TextStyle(fontSize: 10, color: AppColors.textSecondary), textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

class _AppointmentStat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _AppointmentStat({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color)),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
      ],
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickAction({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.primary.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: AppColors.primary, size: 18),
            const SizedBox(width: 8),
            Text(label, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w500, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}
